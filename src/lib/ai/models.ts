export interface ModelOption {
  id: string;
  provider: string;
  name: string;
  description: string;
  isDefault?: boolean;
  supportsTools?: boolean; // false = cannot use MCP tools reliably
}

// Model IDs verified from official docs on 2026-04-15
// See docs/AI_PROVIDER_RESEARCH.md for pricing and details
export const MODEL_OPTIONS: ModelOption[] = [
  // Anthropic
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.6',
    description: 'Best balance of speed and intelligence',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    name: 'Claude Opus 4.6',
    description: 'Most capable, best for complex tasks',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    description: 'Fastest and most affordable',
  },
  // OpenAI
  {
    id: 'gpt-5.4',
    provider: 'openai',
    name: 'GPT-5.4',
    description: 'Best balance of intelligence and speed',
    isDefault: true,
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    name: 'GPT-5.4 Mini',
    description: 'Good and affordable',
  },
  {
    id: 'gpt-5.4-nano',
    provider: 'openai',
    name: 'GPT-5.4 Nano',
    description: 'Cheapest — no Planning Center access',
    supportsTools: false,
  },
  // Google
  {
    id: 'gemini-3.1-flash',
    provider: 'google',
    name: 'Gemini 3.1 Flash',
    description: 'Fast and capable, free tier available',
    isDefault: true,
  },
  {
    id: 'gemini-3.1-pro',
    provider: 'google',
    name: 'Gemini 3.1 Pro',
    description: 'Most capable Google model',
  },
  {
    id: 'gemini-3.1-flash-lite',
    provider: 'google',
    name: 'Gemini 3.1 Flash-Lite',
    description: 'Cheapest — no Planning Center access',
    supportsTools: false,
  },
];

export function getDefaultModel(provider: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.provider === provider && m.isDefault);
}

export function modelSupportsTools(modelId: string): boolean {
  const model = MODEL_OPTIONS.find((m) => m.id === modelId);
  return model?.supportsTools !== false; // default true if not specified
}
