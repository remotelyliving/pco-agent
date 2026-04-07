import { generateObject } from 'ai';
import { z } from 'zod';
import { createModel } from '@/lib/ai/providers';
import { upsertMemory } from '@/lib/memory/queries';

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
      }),
    )
    .describe(
      'Factual information about the church or organization extracted from this conversation',
    ),
});

export async function extractAndSaveMemories(
  orgId: string,
  _userId: string,
  userMessage: string,
  assistantMessage: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  try {
    const modelId = CHEAP_MODELS[provider] ?? CHEAP_MODELS.anthropic;
    const model = createModel(provider, modelId, apiKey);

    const prompt = [
      'Extract factual information about the church or organization from this conversation exchange.',
      'Only extract clear, objective facts (names, times, locations, preferences).',
      'Do not extract opinions or temporary information.',
      'Return an empty facts array if nothing useful is found.',
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
      await upsertMemory(orgId, fact.key, fact.value, 'auto', undefined);
    }
  } catch {
    // best-effort: never throw
  }
}
