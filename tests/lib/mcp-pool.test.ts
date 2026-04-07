import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClose, mockTools } = vi.hoisted(() => ({
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockTools: vi.fn().mockResolvedValue({}),
}));

vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: vi.fn().mockResolvedValue({
    tools: mockTools,
    close: mockClose,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { getMCPClient, getPoolSize, _resetPool } from '@/lib/mcp-pool';
import { createMCPClient } from '@ai-sdk/mcp';

describe('MCP connection pool', () => {
  beforeEach(() => {
    _resetPool();
    vi.clearAllMocks();
  });

  it('creates a new client on first call', async () => {
    const client = await getMCPClient('https://mcp.test/mcp', 'token-1');
    expect(client).toBeDefined();
    expect(createMCPClient).toHaveBeenCalledTimes(1);
    expect(createMCPClient).toHaveBeenCalledWith({
      transport: {
        type: 'sse',
        url: 'https://mcp.test/mcp',
        headers: { Authorization: 'Bearer token-1' },
      },
    });
  });

  it('reuses client on second call with same token', async () => {
    await getMCPClient('https://mcp.test/mcp', 'token-2');
    await getMCPClient('https://mcp.test/mcp', 'token-2');
    expect(createMCPClient).toHaveBeenCalledTimes(1);
  });

  it('creates separate clients for different tokens', async () => {
    await getMCPClient('https://mcp.test/mcp', 'token-a');
    await getMCPClient('https://mcp.test/mcp', 'token-b');
    expect(createMCPClient).toHaveBeenCalledTimes(2);
  });

  it('reports pool size', async () => {
    expect(getPoolSize()).toBe(0);
    await getMCPClient('https://mcp.test/mcp', 'token-x');
    expect(getPoolSize()).toBe(1);
    await getMCPClient('https://mcp.test/mcp', 'token-y');
    expect(getPoolSize()).toBe(2);
  });

  it('evicts expired clients on next access', async () => {
    // Create a client
    await getMCPClient('https://mcp.test/mcp', 'token-expire');
    expect(createMCPClient).toHaveBeenCalledTimes(1);

    // Advance time past TTL (5 minutes)
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000);

    // Next call should create a new client
    await getMCPClient('https://mcp.test/mcp', 'token-expire');
    expect(createMCPClient).toHaveBeenCalledTimes(2);
    expect(mockClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('resets pool correctly', async () => {
    await getMCPClient('https://mcp.test/mcp', 'token-reset');
    expect(getPoolSize()).toBe(1);
    _resetPool();
    expect(getPoolSize()).toBe(0);
    expect(mockClose).toHaveBeenCalled();
  });
});
