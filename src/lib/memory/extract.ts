import { generateObject } from 'ai';
import { z } from 'zod';
import { MemorySource } from '@prisma/client';
import { createModel } from '@/lib/ai/providers';
import { getAllMemoriesForUser, upsertMemory, deleteAutoMemoryByKey, enforceUserMemoryCap } from '@/lib/memory/queries';

const MAX_EXTRACTION_INPUT_LENGTH = 4000;
const MAX_EXISTING_MEMORIES_LENGTH = 2000;

/** Sentinel value: when the model returns this as a fact's value, the fact is deleted. */
export const DELETE_SENTINEL = '__DELETE__';

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}

const CHEAP_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5.4-nano',
  google: 'gemini-3.1-flash-lite',
};

const factsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().describe('A short snake_case key for the fact (e.g. preferred_format)'),
        value: z.string().describe('The value of the fact, or __DELETE__ if the fact is now outdated/wrong'),
      }),
    )
    .describe('New or updated facts from this conversation. Include corrections to existing facts.'),
});

/** Format existing memories as a compact string for the extraction prompt. */
function formatExistingMemories(memories: Array<{ key: string; value: string }>): string {
  if (memories.length === 0) return '';
  const lines = memories.map((m) => `- ${m.key}: ${m.value}`);
  const joined = lines.join('\n');
  return truncate(joined, MAX_EXISTING_MEMORIES_LENGTH);
}

export async function extractAndSaveMemories(
  orgId: string,
  userId: string,
  userMessage: string,
  assistantMessage: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  const modelId = CHEAP_MODELS[provider] ?? CHEAP_MODELS.anthropic;
  const model = createModel(provider, modelId, apiKey);

  // Fetch current memories so the model can detect stale/conflicting facts
  const existingMemories = await getAllMemoriesForUser(orgId, userId);
  const existingSection = formatExistingMemories(
    existingMemories.map((m) => ({ key: m.key, value: m.value })),
  );

  const promptParts = [
    'Extract facts from this conversation that are specific to THIS user.',
    '- Personal preferences, communication style, role duties, workflows, how they like information presented.',
    '- Also include factual information they mention (names, schedules, policies) — these will be stored as personal notes.',
    '',
  ];

  if (existingSection) {
    promptParts.push(
      'Here are the facts currently stored. If the conversation contains fresh data that contradicts or updates any existing fact, return the corrected version with the same key. If a fact is clearly wrong or outdated based on the conversation, return it with value "__DELETE__".',
      '',
      `<existing_facts>\n${existingSection}\n</existing_facts>`,
      '',
    );
  }

  promptParts.push(
    'Only extract clear, objective facts. Return an empty facts array if nothing useful is found.',
    '',
    `<user_message>${truncate(userMessage, MAX_EXTRACTION_INPUT_LENGTH)}</user_message>`,
    `<assistant_message>${truncate(assistantMessage, MAX_EXTRACTION_INPUT_LENGTH)}</assistant_message>`,
  );

  const { object } = await generateObject({
    model,
    schema: factsSchema,
    prompt: promptParts.join('\n'),
  });

  if (object.facts.length === 0) return;

  for (const fact of object.facts) {
    if (fact.value === DELETE_SENTINEL) {
      // Model flagged this fact as outdated — remove it
      await deleteAutoMemoryByKey(orgId, userId, fact.key);
    } else {
      // All auto-extracted memories are user-scoped. Org-wide memories require manual admin creation.
      await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, userId);
    }
  }

  await enforceUserMemoryCap(orgId, userId);
}
