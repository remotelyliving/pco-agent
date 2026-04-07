export interface ModelOption {
  id: string;
  provider: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.5',
    description: 'Fast and capable, great for most tasks',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-5-20250414',
    provider: 'anthropic',
    name: 'Claude Opus 4.5',
    description: 'Most capable, best for complex reasoning',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'Fast and capable multimodal model',
    isDefault: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'Affordable and fast for simple tasks',
  },
  {
    id: 'gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and efficient, good for most tasks',
    isDefault: true,
  },
];

export function getDefaultModel(provider: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.provider === provider && m.isDefault);
}
