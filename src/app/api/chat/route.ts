import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { MessageRole } from '@prisma/client';
import { getToken } from 'next-auth/jwt';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { createModel } from '@/lib/ai/providers';
import { getMCPClient } from '@/lib/mcp-pool';
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
  // 0. Request tracing
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

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

  // 3–8. Pre-stream setup: user lookup, conversation, message save, rules, memory, MCP
  let user!: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;
  let apiKey!: string;
  let modelId!: string;
  let conversationId!: string;
  let lastUserMessage: UIMessage | undefined;
  let systemPrompt!: string;
  let tools = {};

  try {
    // 3. Load user with API key
    const foundUser = await prisma.user.findUnique({
      where: { id: session.user.agentUserId },
    });

    if (!foundUser?.apiProvider || !foundUser?.apiKeyEnc) {
      return Response.json(
        { error: 'No API key configured. Go to Settings to add one.' },
        { status: 400 },
      );
    }

    user = foundUser;

    // 4. Decrypt API key
    apiKey = decrypt(user.apiKeyEnc!, getEncryptionKey());
    modelId =
      user.preferredModel ||
      getDefaultModel(user.apiProvider!)?.id ||
      'claude-sonnet-4-5-20250514';

    // 5. Verify conversation ownership if reusing, or create new
    if (existingConvId) {
      const existingConv = await getConversation(existingConvId, session.user.agentUserId);
      if (!existingConv) {
        return new Response('Conversation not found', { status: 404 });
      }
    }
    conversationId =
      existingConvId ||
      (await createConversation(session.user.agentUserId)).id;

    // 6. Save the user message
    lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === 'user') {
      const textContent = lastUserMessage.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      await saveMessage({
        conversationId,
        role: MessageRole.user,
        content: textContent,
      });
    }

    // 7. Connect to MCP server (using PCO access token from JWT)
    const jwtToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const pcoAccessToken = jwtToken?.pcoAccessToken as string | undefined;

    if (pcoAccessToken) {
      try {
        const result = await new Promise<{ client: Awaited<ReturnType<typeof getMCPClient>>; mcpTools: Record<string, unknown> }>(
          async (resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('MCP setup timeout (30s)')),
              30_000,
            );
            try {
              const client = await getMCPClient(
                process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
                pcoAccessToken,
              );
              const mcpTools = await client.tools();
              clearTimeout(timer);
              resolve({ client, mcpTools });
            } catch (err) {
              clearTimeout(timer);
              reject(err);
            }
          },
        );
        // mcpClient lifecycle managed by connection pool — no need to track reference
        tools = result.mcpTools;
      } catch (error) {
        log.error('MCP connection failed', {
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
    systemPrompt = buildSystemPrompt(
      typeof assembledRules === 'string' ? assembledRules : '',
      memoryPrompt,
    );
  } catch (error) {
    log.error('[chat] Pre-stream error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }

  // 9. Stream the response
  const result = streamText({
      model: createModel(user.apiProvider!, modelId, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
      onFinish: async ({ text, toolCalls, usage }) => {
        try {
          // Save assistant message
          await saveMessage({
            conversationId,
            role: MessageRole.assistant,
            content: text || '',
            toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
            tokenCount: usage?.totalTokens ?? null,
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
            ).catch((err) => log.error('[chat] Memory extraction failed', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
            }));
          }

          // MCP client lifecycle managed by connection pool
        } catch (error) {
          log.error('[chat] onFinish failed — message may not be persisted', {
            conversationId,
            userId: session.user.agentUserId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      onError: async ({ error }) => {
        log.error('[chat] Stream error', {
          conversationId,
          userId: session.user.agentUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });

  return result.toUIMessageStreamResponse({
    headers: {
      'x-conversation-id': conversationId,
      'x-request-id': requestId,
    },
  });
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

