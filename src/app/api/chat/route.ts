import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { MessageRole } from '@prisma/client';
// getToken() from next-auth/jwt is deprecated in v5 and returns null.
// PCO tokens are accessed via auth() session callback instead.
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
  getMessages,
} from '@/lib/chat/persist';
import { assembleRules } from '@/lib/rules/assemble';
import { getMemoryPrompt } from '@/lib/memory/retrieve';
import { extractAndSaveMemories } from '@/lib/memory/extract';
import { getOnboardingPrompt, ONBOARDING_COMPLETE_SIGNAL } from '@/lib/onboarding/prompts';
import { extractOnboardingProfile } from '@/lib/onboarding/extract';
import { parseFileToText } from '@/lib/files/parse';
import { getFileStore } from '@/lib/files/store';
import { getFileRecord, createFileRecord } from '@/lib/files/persist';
import { sanitizeRows } from '@/lib/files/sanitize';
import { EXTENSION_TO_MIME, IMAGE_MIME_TYPES } from '@/lib/files/types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

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
  let lastUserText = '';
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
      lastUserText = textContent;
      await saveMessage({
        conversationId,
        role: MessageRole.user,
        content: textContent,
      });
    }

    // 7. Connect to MCP server (using PCO access token from session)
    const pcoAccessToken = session.pcoAccessToken;

    if (!pcoAccessToken && session.pcoRefreshToken) {
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
        hasRefreshToken: !!session.pcoRefreshToken,
      });
    }

    // 8. Build system prompt with assembled rules and memory (parallelized)
    const [assembledRules, memoryPrompt] = await Promise.all([
      assembleRules(session.user.agentUserId, session.user.orgId, { formatAsPrompt: true }),
      getMemoryPrompt(session.user.orgId, session.user.agentUserId, lastUserText || undefined),
    ]);

    // Check if user needs onboarding
    let onboardingInstructions: string | undefined;
    if (!user.onboardingComplete) {
      const orgMemoryCount = await prisma.memory.count({ where: { orgId: session.user.orgId, userId: null } });
      onboardingInstructions = getOnboardingPrompt(orgMemoryCount > 0);
    }

    systemPrompt = buildSystemPrompt(
      typeof assembledRules === 'string' ? assembledRules : '',
      memoryPrompt,
      mcpConnected,
      onboardingInstructions,
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

  // 8b. Convert file attachments in ALL messages (not just the last).
  // The client replays full history, so earlier messages may contain file parts
  // that the model provider can't handle natively (e.g., text/csv).
  // Images are only included from the last 4 user messages to bound memory usage.
  const MAX_IMAGE_REPLAY_MESSAGES = 4;
  const userMsgIndices = messages
    .map((m, i) => m.role === 'user' ? i : -1)
    .filter((i) => i >= 0);
  const imageReplayCutoff = userMsgIndices.length > MAX_IMAGE_REPLAY_MESSAGES
    ? userMsgIndices[userMsgIndices.length - MAX_IMAGE_REPLAY_MESSAGES]
    : 0;

  const processedMessages = await Promise.all(
    messages.map(async (msg, msgIndex) => {
      if (msg.role !== 'user' || !msg.parts) return msg;
      const hasFiles = msg.parts.some((p) => p.type === 'file' && 'url' in p);
      if (!hasFiles) return msg;
      const newParts = [];
      for (const part of msg.parts) {
        if (part.type === 'file' && 'url' in part) {
          const fileUrl = (part as { type: 'file'; url: string }).url;
          const fileIdMatch = fileUrl.match(/\/api\/files\/([^/?]+)/);
          if (fileIdMatch) {
            const fileRecord = await getFileRecord(fileIdMatch[1]);
            // Verify file belongs to this user's org before injecting into context
            if (fileRecord && fileRecord.orgId === session.user.orgId && fileRecord.userId === session.user.agentUserId) {
              const store = getFileStore();
              const stored = await store.get(fileRecord.storageKey);
              if (stored) {
                try {
                  // Images: send as file parts with data URLs (all providers support vision)
                  if ((IMAGE_MIME_TYPES as readonly string[]).includes(fileRecord.mediaType)) {
                    // Skip base64 encoding for images in older messages to bound memory
                    if (msgIndex < imageReplayCutoff) {
                      newParts.push({ type: 'text' as const, text: `[Image: ${fileRecord.filename}]` });
                      continue;
                    }
                    const base64 = stored.data.toString('base64');
                    const dataUrl = `data:${fileRecord.mediaType};base64,${base64}`;
                    newParts.push({ type: 'file' as const, url: dataUrl, mediaType: fileRecord.mediaType, filename: fileRecord.filename });
                    continue;
                  }
                  // Data files: convert to text for model context
                  const parsed = parseFileToText(stored.data, fileRecord.mediaType, fileRecord.filename);
                  newParts.push({ type: 'text' as const, text: parsed });
                  continue;
                } catch {
                  newParts.push({ type: 'text' as const, text: `[File "${fileRecord.filename}" could not be processed]` });
                  continue;
                }
              }
            }
          }
          // File couldn't be resolved — drop the part to avoid unsupported media type errors
          newParts.push({ type: 'text' as const, text: '[File attachment could not be loaded]' });
        } else {
          newParts.push(part);
        }
      }
      return { ...msg, parts: newParts };
    }),
  );

  // 8c. Register local create_file tool for AI-generated downloads
  const createFileInputSchema = z.object({
    filename: z.string().describe('Name for the file, e.g. "sunday-schedule.csv"'),
    format: z.enum(['csv', 'xlsx']).describe('File format'),
    headers: z.array(z.string()).describe('Column headers'),
    rows: z.array(z.array(z.string())).describe('Row data — each row is an array of cell values'),
  });
  const createFileTool = tool<z.infer<typeof createFileInputSchema>, { fileId: string; downloadUrl: string; filename: string; sizeBytes: number }>({
    description: 'Create a downloadable file for the user (CSV or Excel spreadsheet). Use this when the user asks you to export, generate, or create a file they can download.',
    inputSchema: createFileInputSchema,
    execute: async ({ filename, format, headers, rows }) => {
      const sanitized = sanitizeRows(rows);
      let data: Buffer;
      let mediaType: string;

      if (format === 'csv') {
        const csvContent = Papa.unparse({ fields: headers, data: sanitized });
        data = Buffer.from(csvContent, 'utf-8');
        mediaType = 'text/csv';
      } else {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sanitized]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        data = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
        mediaType = EXTENSION_TO_MIME['.xlsx'];
      }

      const ext = format === 'csv' ? '.csv' : '.xlsx';
      const storageKey = `${session.user.orgId}/${session.user.agentUserId}/${randomUUID()}${ext}`;
      const store = getFileStore();
      await store.put(storageKey, data, {
        filename,
        mediaType,
        sizeBytes: data.length,
        userId: session.user.agentUserId,
        orgId: session.user.orgId,
        conversationId,
      });

      const record = await createFileRecord({
        userId: session.user.agentUserId,
        orgId: session.user.orgId,
        conversationId,
        filename,
        mediaType,
        sizeBytes: data.length,
        storageKey,
      });

      return {
        fileId: record.id,
        downloadUrl: `/api/files/${record.id}`,
        filename,
        sizeBytes: data.length,
      };
    },
  });

  const allTools = { ...tools, create_file: createFileTool };

  // 9. Stream the response
  const result = streamText({
      model: createModel(user.apiProvider!, modelId, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(processedMessages),
      tools: allTools,
      stopWhen: stepCountIs(5),
      onFinish: async ({ text, toolCalls, usage }) => {
        try {
          // Strip onboarding completion signal before saving
          let displayText = text || '';
          const hadOnboardingSignal = displayText.includes(ONBOARDING_COMPLETE_SIGNAL);
          if (hadOnboardingSignal) {
            displayText = displayText.replace(ONBOARDING_COMPLETE_SIGNAL, '').trimEnd();
          }

          // Save assistant message
          await saveMessage({
            conversationId,
            role: MessageRole.assistant,
            content: displayText,
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

          // Memory extraction — onboarding vs. generic
          if (text && lastUserMessage?.role === 'user') {
            if (!user.onboardingComplete) {
              // Onboarding extraction: check if we should trigger
              const shouldExtract = hadOnboardingSignal ||
                (toolCalls && toolCalls.length > 0);

              if (shouldExtract) {
                // Load full conversation for onboarding extraction
                const convMessages = await getMessages(conversationId, { take: 50 });
                const formattedMessages = convMessages.map((m) => ({
                  role: m.role,
                  content: m.content,
                }));

                extractOnboardingProfile({
                  orgId: session.user.orgId,
                  userId: session.user.agentUserId,
                  conversationId,
                  messages: formattedMessages,
                  provider: user.apiProvider!,
                  apiKey,
                }).catch((err) => log.error('[chat] Onboarding extraction failed', {
                  conversationId,
                  error: err instanceof Error ? err.message : String(err),
                }));
              }
              // Generic extraction is suppressed during onboarding
            } else {
              // Normal extraction
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

function buildSystemPrompt(rules: string, memory?: string, mcpConnected?: boolean, onboardingInstructions?: string): string {
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

  if (onboardingInstructions) {
    prompt += `\n\n${onboardingInstructions}`;
  }

  return prompt;
}

