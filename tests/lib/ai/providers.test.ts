import { describe, it, expect } from 'vitest';
import { createModel, SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

describe('createModel', () => {
  it('creates an anthropic model', () => {
    const model = createModel('anthropic', 'claude-sonnet-4-5-20250514', 'sk-ant-test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude-sonnet-4-5-20250514');
  });

  it('creates an openai model', () => {
    const model = createModel('openai', 'gpt-4o', 'sk-test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gpt-4o');
  });

  it('creates a google model', () => {
    const model = createModel('google', 'gemini-2.0-flash', 'test-key');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gemini-2.0-flash');
  });

  it('throws for unknown provider', () => {
    expect(() => createModel('unknown', 'model', 'key')).toThrow('Unsupported provider');
  });

  it('exports SUPPORTED_PROVIDERS list', () => {
    expect(SUPPORTED_PROVIDERS).toContain('anthropic');
    expect(SUPPORTED_PROVIDERS).toContain('openai');
    expect(SUPPORTED_PROVIDERS).toContain('google');
    expect(SUPPORTED_PROVIDERS).toHaveLength(3);
  });
});
