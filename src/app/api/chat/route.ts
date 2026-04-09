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
import { getDefaultModel, modelSupportsTools } from '@/lib/ai/models';
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

  // 2–8. Parse request + pre-stream setup
  let user!: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;
  let apiKey!: string;
  let modelId!: string;
  let conversationId!: string;
  let lastUserMessage: UIMessage | undefined;
  let systemPrompt!: string;
  let tools = {};
  let messages!: UIMessage[];
  let existingConvId: string | undefined;

  try {
    // 2. Parse request
    const body = await req.json();
    const { messages: parsedMessages, conversationId: parsedConvId } = body as {
      messages: UIMessage[];
      conversationId?: string;
    };
    messages = parsedMessages;
    existingConvId = parsedConvId;

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

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
      'claude-sonnet-4-6';

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

    if (!pcoAccessToken && jwtToken?.pcoRefreshToken) {
      // Token existed but refresh failed — user needs to re-login
      return Response.json(
        { error: 'Your Planning Center session has expired. Please sign out and sign back in.' },
        { status: 401 },
      );
    }

    let mcpConnected = false;
    const canUseTools = modelSupportsTools(modelId);
    if (pcoAccessToken && canUseTools) {
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
        mcpConnected = Object.keys(tools).length > 0;
        log.info('[chat] MCP tools loaded', {
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools).slice(0, 10),
        });
      } catch (error) {
        log.error('[chat] MCP connection failed', {
          userId: session.user.agentUserId,
          orgId: session.user.orgId,
          mcpUrl: process.env.PCO_MCP_URL || 'https://pco-mcp.com/mcp',
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without MCP tools -- chat still works, just no PCO data access
      }
    } else {
      log.warn('[chat] No PCO access token — MCP tools unavailable', {
        userId: session.user.agentUserId,
        hasRefreshToken: !!jwtToken?.pcoRefreshToken,
      });
    }

    // 8. Build system prompt with assembled rules and memory (parallelized)
    const [assembledRules, memoryPrompt] = await Promise.all([
      assembleRules(session.user.agentUserId, session.user.orgId, { formatAsPrompt: true }),
      getMemoryPrompt(session.user.orgId, session.user.agentUserId),
    ]);
    systemPrompt = buildSystemPrompt(
      typeof assembledRules === 'string' ? assembledRules : '',
      memoryPrompt,
      mcpConnected,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
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

          // Auto-title from user's first message
          if (!existingConvId && lastUserMessage?.role === 'user') {
            const userText = lastUserMessage.parts
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join(' ');
            if (userText) {
              await updateConversationTitle(conversationId, generateTitle(userText));
            }
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
          errorStack: error instanceof Error ? error.stack : undefined,
          errorFull: JSON.stringify(error, Object.getOwnPropertyNames(error || {})),
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

function generateTitle(userMessage: string): string {
  const words = userMessage.trim().split(/\s+/).slice(0, 10).join(' ');
  if (words.length <= 60) return words;
  return words.slice(0, 60).replace(/\s+\S*$/, '') + '...';
}

function buildSystemPrompt(rules: string, memory?: string, mcpConnected?: boolean): string {
  let prompt = `You are Service Planner, an AI assistant for church staff who use Planning Center Online (PCO). You help with people management, service planning, volunteer scheduling, and song library management — all through natural conversation.

Be friendly, use plain language, and avoid technical jargon. If you're unsure about something, say so rather than guessing. When you use a tool and get results, summarize them in a clear, readable way.

**IMPORTANT: You have tools available that connect to Planning Center. When a user asks about people, services, teams, songs, or scheduling, ALWAYS use the appropriate tool — never guess or make up data. If you're unsure which tool to use, start with the most general one (like list_service_types or search_people) to explore.**

## Planning Center Data Model

Planning Center has two main modules you can work with:

**People** — The church directory. Every person has an ID, name, email, phone, membership status, and may have blockout dates (times they're unavailable to serve).

**Services** — Where worship services are planned. The hierarchy is:
- **Service Types** are recurring event categories (e.g., "Sunday Morning", "Wednesday Night"). Start here with list_service_types.
- **Plans** are specific dated instances of a service type (e.g., the Sunday Morning plan for June 15). Use get_upcoming_plans with a service_type_id.
- **Plan Items** are the ordered elements within a plan — songs, readings, announcements, etc. Use list_plan_items.
- **Teams** are groups of volunteers organized by role (e.g., "Worship Team", "Production Team"). Each team has **Positions** (e.g., "Lead Vocalist", "Sound Tech"). Use list_teams → list_team_positions.
- **Team Members** are people scheduled to serve in specific positions for a specific plan. Use list_team_members to see who's assigned, get_needed_positions to see what's unfilled.

## How to Use Your Tools

**Looking up people:**
- search_people(name/email/phone) → returns basic info + IDs
- get_person(person_id) → returns full details for one person
- list_lists() → shows all groups/tags; get_list_members(list_id) → people in a group

**Viewing services:**
1. list_service_types() → get the service_type_id
2. get_upcoming_plans(service_type_id) → get plan_id for a date
3. get_plan_details(service_type_id, plan_id) → full plan with songs, teams, times
4. list_plan_items(service_type_id, plan_id) → ordered service flow

**Scheduling volunteers:**
1. Find the person: search_people(name)
2. Check their availability: get_person_blockouts(person_id)
3. Find what positions need filling: get_needed_positions(service_type_id, plan_id)
4. Schedule them: schedule_team_member(service_type_id, plan_id, person_id, team_position_name)
- Always check blockouts before scheduling. Always confirm with the user before scheduling.

**Working with songs:**
- list_songs(query) → search the song library
- get_song_schedule_history(song_id) → see when it was last used (for rotation)
- list_song_arrangements(song_id) → available arrangements with BPM, meter, length
- add_item_to_plan(service_type_id, plan_id, title, song_id) → add a song to a plan

**Creating new plans:**
1. list_service_types() → pick the right service type
2. create_plan(service_type_id, title, sort_date) → creates the plan
3. create_plan_time(service_type_id, plan_id, starts_at, ends_at, name, time_type) → add service/rehearsal times
4. add_item_to_plan() → add songs and elements
5. schedule_team_member() → fill team positions

**Important patterns:**
- Most service tools require both service_type_id AND plan_id — always get these first.
- IDs are strings, not numbers. Pass them exactly as returned from previous tool calls.
- Dates use YYYY-MM-DD format. Datetimes use ISO format (e.g., "2025-06-15T09:00:00-05:00").
- When the user says "this Sunday" or "next week", calculate the actual date.
- Confirm with the user before creating, updating, or removing any records.`;

  if (!mcpConnected) {
    prompt += `\n\n## ⚠️ Planning Center Connection Unavailable\n\nYou do NOT have access to Planning Center tools right now. If the user asks you to look up people, services, or other PCO data, let them know that the connection to Planning Center is not available and suggest they try signing out and back in. Do NOT make up or guess any data.`;
  }

  if (memory) {
    prompt += `\n\n${memory}`;
  }

  if (rules) {
    prompt += `\n\n## Rules\n\nFollow these rules in all your responses:\n${rules}`;
  }

  return prompt;
}

