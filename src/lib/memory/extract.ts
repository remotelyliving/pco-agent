import { generateObject } from 'ai';
import { z } from 'zod';
import { MemorySource } from '@prisma/client';
import { createModel } from '@/lib/ai/providers';
import { upsertMemory, enforceMemoryCap, enforceUserMemoryCap } from '@/lib/memory/queries';

const CHEAP_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
};

const factsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().describe('A short snake_case key for the fact (e.g. pastor_name)'),
        value: z.string().describe('The value of the fact'),
        scope: z.enum(['org', 'user']).describe(
          'org = about the church (names, times, policies). user = about this specific person (preferences, role, style)',
        ),
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
    'Extract facts from this conversation.',
    '- Org facts (scope: "org"): things about the church that any staff member would find useful',
    '  (names, schedules, policies, team structure, event details)',
    '- User facts (scope: "user"): things specific to THIS user\'s preferences or working style',
    '  (communication preferences, role duties, personal workflows, how they like information presented)',
    '',
    'Only extract clear, objective facts. Return an empty facts array if nothing useful is found.',
    '',
    `User: ${userMessage}`,
    `Assistant: ${assistantMessage}`,
  ].join('\n');

  const { object } = await generateObject({
    model,
    schema: factsSchema,
    prompt,
  });

  for (const fact of object.facts) {
    const factUserId = fact.scope === 'user' ? userId : undefined;
    await upsertMemory(orgId, fact.key, fact.value, MemorySource.auto, factUserId);
  }

  await enforceMemoryCap(orgId);
  await enforceUserMemoryCap(orgId, userId);
}
