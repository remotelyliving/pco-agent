import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('getEncryptionKey returns value when set', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-key-value');
    const { getEncryptionKey } = await import('@/lib/env');
    expect(getEncryptionKey()).toBe('test-key-value');
  });

  it('getEncryptionKey throws when not set', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    const mod = await import('@/lib/env');
    expect(() => mod.getEncryptionKey()).toThrow('Missing required environment variable: ENCRYPTION_KEY');
  });

  it('validateEnv throws listing all missing vars', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    vi.stubEnv('PCO_CLIENT_ID', '');
    vi.stubEnv('PCO_CLIENT_SECRET', '');
    vi.stubEnv('ENCRYPTION_KEY', '');
    const mod = await import('@/lib/env');
    expect(() => mod.validateEnv()).toThrow('Missing required environment variables');
  });
});
