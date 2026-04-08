import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports a logger instance', async () => {
    const { logger } = await import('../../src/lib/logger');
    expect(logger).toBeDefined();
  });

  it('exports info, warn, error, and child methods', async () => {
    const { logger } = await import('../../src/lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('logger.info accepts (message, context?) signature', async () => {
    const { logger } = await import('../../src/lib/logger');
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.info('test message', { key: 'value' })).not.toThrow();
  });

  it('logger.warn accepts (message, context?) signature', async () => {
    const { logger } = await import('../../src/lib/logger');
    expect(() => logger.warn('test message')).not.toThrow();
    expect(() => logger.warn('test message', { key: 'value' })).not.toThrow();
  });

  it('logger.error accepts (message, context?) signature', async () => {
    const { logger } = await import('../../src/lib/logger');
    expect(() => logger.error('test message')).not.toThrow();
    expect(() => logger.error('test message', { error: 'something went wrong' })).not.toThrow();
  });

  it('logger.child returns a logger with the same interface', async () => {
    const { logger } = await import('../../src/lib/logger');
    const child = logger.child({ requestId: 'abc123' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.child).toBe('function');
  });

  it('child logger can log with (message, context?) signature', async () => {
    const { logger } = await import('../../src/lib/logger');
    const child = logger.child({ requestId: 'abc123' });
    expect(() => child.info('child message')).not.toThrow();
    expect(() => child.info('child message', { extra: 'data' })).not.toThrow();
  });

  it('child logger can produce grandchild loggers', async () => {
    const { logger } = await import('../../src/lib/logger');
    const child = logger.child({ requestId: 'abc123' });
    const grandchild = child.child({ userId: 'user-1' });
    expect(typeof grandchild.info).toBe('function');
    expect(typeof grandchild.warn).toBe('function');
    expect(typeof grandchild.error).toBe('function');
    expect(typeof grandchild.child).toBe('function');
  });

  it('exports Logger and LogContext types (module shape)', async () => {
    // This verifies the module exports compile correctly; type-only exports
    // are erased at runtime, so we just check the module imports without error.
    const mod = await import('../../src/lib/logger');
    expect(mod.logger).toBeDefined();
  });
});
