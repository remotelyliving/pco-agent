export interface ProviderInfo {
  name: string;
  description: string;
  keyUrl: string;
  keySteps: string[];
}

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export const PROVIDER_INFO: Record<SupportedProvider, ProviderInfo> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Advanced AI with excellent reasoning and tool use',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keySteps: [
      'Go to console.anthropic.com',
      'Sign in or create an account',
      'Click "API Keys" in the sidebar',
      'Click "Create Key" and copy the key',
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'Widely used AI with strong general capabilities',
    keyUrl: 'https://platform.openai.com/api-keys',
    keySteps: [
      'Go to platform.openai.com',
      'Sign in or create an account',
      'Click "API keys" in the sidebar',
      'Click "Create new secret key" and copy it',
    ],
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Google AI with a generous free tier',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keySteps: [
      'Go to aistudio.google.com',
      'Sign in with your Google account',
      'Click "Get API key"',
      'Create a key and copy it',
    ],
  },
};

export function getProviderDisplayName(provider: string): string {
  return (PROVIDER_INFO as Record<string, ProviderInfo>)[provider]?.name ?? provider;
}
