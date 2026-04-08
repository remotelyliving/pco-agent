import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { logger } from '@/lib/logger';

interface PoolEntry {
  client: MCPClient;
  createdAt: number;
  lastUsed: number;
}

const CLIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_POOL_SIZE = 100;
const CONNECTION_TIMEOUT_MS = 15_000; // 15 seconds
const pool = new Map<string, PoolEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pool.entries()) {
      if (now - entry.lastUsed > CLIENT_TTL_MS) {
        entry.client.close().catch(() => {});
        pool.delete(key);
        logger.info('[mcp-pool] Evicted idle client', { poolSize: pool.size });
      }
    }
    if (pool.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't block Node.js exit
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

export async function getMCPClient(
  mcpUrl: string,
  accessToken: string,
): Promise<MCPClient> {
  const key = accessToken;
  const now = Date.now();

  const existing = pool.get(key);
  if (existing && now - existing.createdAt < CLIENT_TTL_MS) {
    existing.lastUsed = now;
    return existing.client;
  }

  // Close expired client if it exists
  if (existing) {
    existing.client.close().catch(() => {});
    pool.delete(key);
  }

  // Evict the least-recently-used entry if at capacity
  if (pool.size >= MAX_POOL_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, entry] of pool.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      const evicted = pool.get(oldestKey);
      evicted?.client.close().catch(() => {});
      pool.delete(oldestKey);
      logger.info('[mcp-pool] Evicted LRU client (pool at capacity)', { poolSize: pool.size });
    }
  }

  const client = await Promise.race([
    createMCPClient({
      transport: {
        type: 'sse',
        url: mcpUrl,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MCP connection timeout')), CONNECTION_TIMEOUT_MS),
    ),
  ]);

  pool.set(key, { client, createdAt: now, lastUsed: now });
  startCleanup();

  logger.info('[mcp-pool] Created new client', { poolSize: pool.size });

  return client;
}

export function getPoolSize(): number {
  return pool.size;
}

// Exported for testing only
export function _resetPool(): void {
  for (const entry of pool.values()) {
    entry.client.close().catch(() => {});
  }
  pool.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
