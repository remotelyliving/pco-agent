import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createModel } from '@/lib/ai/providers';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import {
  createConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/chat/persist';
import { assembleRules } from '@/lib/rules/assemble';

export async function POST(req: Request) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse request
  const body = await req.json();
  const { messages, conversationId: existingConvId } = body as {
    messages: UIMessage[];
    conversationId?: string;
  };

  if (!messages || messages.length === 0) {
    return new Response('No messages provided', { status: 400 });
  }

  // 3. Load user with API key
  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
  });

  if (!user?.apiProvider || !user?.apiKeyEnc) {
    return Response.json(
      { error: 'No API key configured. Go to Settings to add one.' },
      { status: 400 },
    );
  }

  // 4. Decrypt API key
  const apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
  const modelId = user.preferredModel || getDefaultModelId(user.apiProvider);

  // 5. Create or reuse conversation
  const conversationId =
    existingConvId ||
    (await createConversation(session.user.agentUserId)).id;

  // 6. Save the user message
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage?.role === 'user') {
    const textContent = lastUserMessage.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    await saveMessage({
      conversationId,
      role: 'user',
      content: textContent,
    });
  }

  // 7. Connect to MCP server (using PCO access token from JWT)
  let mcpClient: MCPClient | null = null;
  let tools = {};

  const pcoAccessToken = await getPcoAccessToken();

  if (pcoAccessToken) {
    try {
      mcpClient = await createMCPClient({
        transport: {
          type: 'sse',
          url: process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
          headers: {
            Authorization: `Bearer ${pcoAccessToken}`,
          },
        },
      });
      tools = await mcpClient.tools();
    } catch (error) {
      console.error('[chat] MCP connection failed:', error);
      // Continue without MCP tools -- chat still works, just no PCO data access
    }
  }

  // 8. Build system prompt with assembled rules
  const assembledRules = await assembleRules(
    session.user.agentUserId,
    session.user.orgId,
    { formatAsPrompt: true },
  );
  const systemPrompt = buildSystemPrompt(typeof assembledRules === 'string' ? assembledRules : '');

  // 9. Stream the response
  const result = streamText({
    model: createModel(user.apiProvider, modelId, apiKey),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async ({ text, toolCalls }) => {
      // Save assistant message
      await saveMessage({
        conversationId,
        role: 'assistant',
        content: text || '',
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      });

      // Auto-title from first exchange
      if (!existingConvId && text) {
        const title = text.slice(0, 100).split('\n')[0];
        await updateConversationTitle(conversationId, title);
      }

      // Close MCP client
      if (mcpClient) {
        await mcpClient.close();
      }
    },
    onError: async () => {
      if (mcpClient) {
        await mcpClient.close();
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'x-conversation-id': conversationId,
    },
  });
}

function getDefaultModelId(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-5-20250514';
    case 'openai':
      return 'gpt-4o';
    case 'google':
      return 'gemini-2.0-flash';
    default:
      return 'claude-sonnet-4-5-20250514';
  }
}

function buildSystemPrompt(rules: string): string {
  let prompt = `You are a helpful assistant for church staff who use Planning Center Online.

You have access to tools that can search people, view services, check schedules, and manage church data in Planning Center. Use these tools when the user asks about their church data.

Be friendly, use plain language, and avoid technical jargon. If you're unsure about something, say so rather than guessing.

When you use a tool and get results, summarize them in a clear, readable way.`;

  if (rules) {
    prompt += `\n\n## Rules\n\nFollow these rules in all your responses:\n${rules}`;
  }

  return prompt;
}

async function getPcoAccessToken(): Promise<string | null> {
  try {
    const { getToken } = await import('next-auth/jwt');
    const { cookies, headers } = await import('next/headers');

    const cookieStore = await cookies();
    const headerStore = await headers();

    const reqHeaders = new Headers();
    headerStore.forEach((value, key) => {
      reqHeaders.set(key, value);
    });

    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    reqHeaders.set('cookie', cookieHeader);

    const token = await getToken({
      req: { headers: reqHeaders } as Parameters<typeof getToken>[0]['req'],
      secret: process.env.NEXTAUTH_SECRET,
    });
    return (token?.pcoAccessToken as string) || null;
  } catch (error) {
    console.error('[chat] Failed to get PCO access token:', error);
    return null;
  }
}
