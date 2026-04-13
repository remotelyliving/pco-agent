import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllMemoriesForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/memory/queries', () => ({
  getAllMemoriesForUser: mockGetAllMemoriesForUser,
}));

import { getMemoryPrompt, tokenize, scoreMemory } from '@/lib/memory/retrieve';

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------
describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric chars', () => {
    expect(tokenize('Sunday Service')).toEqual(['sunday', 'service']);
  });

  it('removes stopwords', () => {
    expect(tokenize('What is the service time')).toEqual(['service', 'time']);
  });

  it('removes single-character tokens', () => {
    expect(tokenize('a b cd ef')).toEqual(['cd', 'ef']);
  });

  it('handles snake_case keys', () => {
    expect(tokenize('pastor_name')).toEqual(['pastor', 'name']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for stopwords-only input', () => {
    expect(tokenize('the is a an')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scoreMemory
// ---------------------------------------------------------------------------
describe('scoreMemory', () => {
  it('returns 0 when queryKeywords is empty', () => {
    expect(scoreMemory('pastor_name', 'John Smith', 'auto', [])).toBe(0);
  });

  it('scores exact keyword matches', () => {
    const score = scoreMemory('pastor_name', 'John Smith', 'auto', ['pastor', 'name']);
    expect(score).toBeGreaterThan(0);
  });

  it('scores partial matches at 0.5', () => {
    // "pastors" contains "pastor" as substring
    const score = scoreMemory('pastors', 'many', 'auto', ['pastor']);
    expect(score).toBe(0.5);
  });

  it('gives manual memories a boost', () => {
    const autoScore = scoreMemory('pastor_name', 'John', 'auto', ['pastor']);
    const manualScore = scoreMemory('pastor_name', 'John', 'manual', ['pastor']);
    expect(manualScore).toBeGreaterThan(autoScore);
  });

  it('returns 0 for completely unrelated memory', () => {
    const score = scoreMemory('worship_style', 'contemporary', 'auto', ['volunteer', 'schedule']);
    expect(score).toBe(0);
  });

  it('scores higher for more keyword matches', () => {
    const oneMatch = scoreMemory('sunday_service_time', '10 AM', 'auto', ['sunday', 'schedule', 'music']);
    const twoMatch = scoreMemory('sunday_service_time', '10 AM', 'auto', ['sunday', 'service', 'music']);
    expect(twoMatch).toBeGreaterThan(oneMatch);
  });
});

// ---------------------------------------------------------------------------
// getMemoryPrompt
// ---------------------------------------------------------------------------
describe('getMemoryPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty string when no memories exist', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).toBe('');
  });

  it('formats org-level memories under church facts section', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
      { id: 'm2', orgId: 'org-1', userId: null, key: 'sunday_service_time', value: '10:00 AM', source: 'auto' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).toContain('## Known facts about this church');
    expect(result).toContain('- pastor_name: John Smith');
    expect(result).toContain('- sunday_service_time: 10:00 AM');
  });

  it('does not include personal notes section when no user memories', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).not.toContain('## Your personal notes');
  });

  it('formats user-level memories under personal notes section', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
      { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'preferred_contact_method', value: 'email', source: 'manual' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).toContain('## Known facts about this church');
    expect(result).toContain('- pastor_name: John Smith');
    expect(result).toContain('## Your personal notes');
    expect(result).toContain('- preferred_contact_method: email');
  });

  it('returns only personal notes when only user memories exist', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'preferred_contact_method', value: 'email', source: 'manual' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).not.toContain('## Known facts about this church');
    expect(result).toContain('## Your personal notes');
    expect(result).toContain('- preferred_contact_method: email');
  });

  // ---------------------------------------------------------------------------
  // Relevance filtering tests
  // ---------------------------------------------------------------------------
  it('sorts memories by relevance when userMessage is provided', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm1', orgId: 'org-1', userId: null, key: 'worship_style', value: 'contemporary', source: 'auto' },
      { id: 'm2', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
      { id: 'm3', orgId: 'org-1', userId: null, key: 'sunday_service_time', value: '10:00 AM', source: 'auto' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1', 'Who is the pastor?');
    const lines = result.split('\n').filter((l) => l.startsWith('- '));
    // pastor_name should come first since it matches "pastor"
    expect(lines[0]).toContain('pastor_name');
  });

  it('includes all memories when no userMessage is provided (fallback)', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { id: 'm1', orgId: 'org-1', userId: null, key: 'fact_1', value: 'value 1', source: 'auto' },
      { id: 'm2', orgId: 'org-1', userId: null, key: 'fact_2', value: 'value 2', source: 'auto' },
      { id: 'm3', orgId: 'org-1', userId: null, key: 'fact_3', value: 'value 3', source: 'auto' },
    ]);

    const result = await getMemoryPrompt('org-1', 'user-1');
    expect(result).toContain('fact_1');
    expect(result).toContain('fact_2');
    expect(result).toContain('fact_3');
  });

  // ---------------------------------------------------------------------------
  // Token budget tests
  // ---------------------------------------------------------------------------
  it('truncates memories when they exceed the token budget', async () => {
    // Create memories with long values that will exceed 16K chars
    const longValue = 'x'.repeat(2000);
    const memories = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      orgId: 'org-1',
      userId: null,
      key: `fact_${i}`,
      value: longValue,
      source: 'auto' as const,
    }));
    mockGetAllMemoriesForUser.mockResolvedValue(memories);

    const result = await getMemoryPrompt('org-1', 'user-1');
    // 20 memories × ~2010 chars each = ~40K chars, should be truncated to ~16K
    expect(result.length).toBeLessThan(20_000);
    // Should have some but not all memories
    const lines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(20);
  });

  it('prioritizes manual memories within budget when relevance filtering', async () => {
    const longValue = 'x'.repeat(2000);
    // Mix of manual and auto memories, all org-level
    const memories = [
      // This manual memory has no keyword match, but should still rank high due to boost
      { id: 'manual-1', orgId: 'org-1', userId: null, key: 'important_policy', value: 'Always greet visitors', source: 'manual' },
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `auto-${i}`,
        orgId: 'org-1',
        userId: null,
        key: `auto_fact_${i}`,
        value: longValue,
        source: 'auto' as const,
      })),
    ];
    mockGetAllMemoriesForUser.mockResolvedValue(memories);

    const result = await getMemoryPrompt('org-1', 'user-1', 'Tell me about auto facts');
    // Manual memory should be included despite no direct keyword match
    expect(result).toContain('important_policy');
  });
});
