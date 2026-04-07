import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS, getDefaultModel } from '@/lib/ai/models';

describe('MODEL_OPTIONS', () => {
  it('has entries for all three providers', () => {
    const providers = MODEL_OPTIONS.map((m) => m.provider);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('google');
  });

  it('each option has required fields', () => {
    for (const opt of MODEL_OPTIONS) {
      expect(opt.id).toBeTruthy();
      expect(opt.provider).toBeTruthy();
      expect(opt.name).toBeTruthy();
      expect(opt.description).toBeTruthy();
    }
  });
});

describe('getDefaultModel', () => {
  it('returns a default for anthropic', () => {
    const model = getDefaultModel('anthropic');
    expect(model).toBeDefined();
    expect(model?.provider).toBe('anthropic');
  });

  it('returns undefined for unknown provider', () => {
    expect(getDefaultModel('unknown')).toBeUndefined();
  });
});
