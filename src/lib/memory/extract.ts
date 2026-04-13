import { generateObject } from 'ai';
import { z } from 'zod';
import { MemorySource } from '@prisma/client';
import { createModel } from '@/lib/ai/providers';
import { upsertMemory, enforceUserMemoryCap } from '@/lib/memory/queries';

const MAX_EXTRACTION_INPUT_LENGTH = 4000;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}

const CHEAP_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4.1-nano',
  google: 'gemini-2.5-flash-lite',
};

const factsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().describe('A short snake_case key for the fact (e.g. preferred_format)'),
        value: z.string().describe('The value of the fact'),
      }),
    )
    .describe('Facts extracted from this conversation'),
});

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

  const prompt = [
    'Extract facts from this conversation that are specific to THIS user.',
    '- Personal preferences, communication style, role duties, workflows, how they like information presented.',
    '- Also include factual information they mention (names, schedules, policies) — these will be stored as personal notes.',
    '',
    'Only extract clear, objective facts. Return an empty facts array if nothing useful is found.',
    '',
    `<user_message>${truncate(userMessage, MAX_EXTRACTION_INPUT_LENGTH)}</user_message>`,
    `<assistant_message>${truncate(assistantMessage, MAX_EXTRACTION_INPUT_LENGTH)}</assistant_message>`,
  ].join('\n');

  const { object } = await generateObject({
    model,
    schema: factsSchema,
    prompt,
  });

  if (object.facts.length === 0) return;

  for (const fact of object.facts) {
    // All auto-extracted memories are user-scoped. Org-wide memories require manual admin creation.
    await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, userId);
  }

  await enforceUserMemoryCap(orgId, userId);
}
