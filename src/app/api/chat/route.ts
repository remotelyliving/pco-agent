import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { getToken } from 'next-auth/jwt';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createModel } from '@/lib/ai/providers';
import { getDefaultModel } from '@/lib/ai/models';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import {
  createConversation,
  getConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/chat/persist';
import { assembleRules } from '@/lib/rules/assemble';
import { getMemoryPrompt } from '@/lib/memory/retrieve';
import { extractAndSaveMemories } from '@/lib/memory/extract';

export const maxDuration = 120;

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
  const modelId =
    user.preferredModel ||
    getDefaultModel(user.apiProvider)?.id ||
    'claude-sonnet-4-5-20250514';

  // 5. Verify conversation ownership if reusing, or create new
  if (existingConvId) {
    const existingConv = await getConversation(existingConvId, session.user.agentUserId);
    if (!existingConv) {
      return new Response('Conversation not found', { status: 404 });
    }
  }
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

  const jwtToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const pcoAccessToken = jwtToken?.pcoAccessToken as string | undefined;

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
      logger.error('MCP connection failed', {
        userId: session.user.agentUserId,
        orgId: session.user.orgId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without MCP tools -- chat still works, just no PCO data access
    }
  }

  // 8. Build system prompt with assembled rules and memory (parallelized)
  const [assembledRules, memoryPrompt] = await Promise.all([
    assembleRules(session.user.agentUserId, session.user.orgId, { formatAsPrompt: true }),
    getMemoryPrompt(session.user.orgId, session.user.agentUserId),
  ]);
  const systemPrompt = buildSystemPrompt(
    typeof assembledRules === 'string' ? assembledRules : '',
    memoryPrompt,
  );

  // 9. Stream the response
  try {
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
          const title = generateTitle(text);
          await updateConversationTitle(conversationId, title);
        }

        // Fire-and-forget memory extraction
        if (text && lastUserMessage?.role === 'user') {
          const userText = lastUserMessage.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('\n');
          extractAndSaveMemories(
            session.user.orgId,
            session.user.agentUserId,
            userText,
            text,
            user.apiProvider!,
            apiKey,
          ).catch(console.error);
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
  } catch (error) {
    if (mcpClient) await mcpClient.close();
    throw error;
  }
}

function generateTitle(text: string): string {
  // Take first sentence or first line
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim() || '';
  if (firstSentence.length <= 60) return firstSentence;
  return firstSentence.slice(0, 57) + '...';
}

function buildSystemPrompt(rules: string, memory?: string): string {
  let prompt = `You are a helpful assistant for church staff who use Planning Center Online.

You have access to tools that can search people, view services, check schedules, and manage church data in Planning Center. Use these tools when the user asks about their church data.

Be friendly, use plain language, and avoid technical jargon. If you're unsure about something, say so rather than guessing.

When you use a tool and get results, summarize them in a clear, readable way.`;

  if (memory) {
    prompt += `\n\n${memory}`;
  }

  if (rules) {
    prompt += `\n\n## Rules\n\nFollow these rules in all your responses:\n${rules}`;
  }

  return prompt;
}

