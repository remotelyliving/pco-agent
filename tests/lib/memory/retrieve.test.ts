import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAllMemoriesForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/memory/queries', () => ({
  getAllMemoriesForUser: mockGetAllMemoriesForUser,
}));

import { getMemoryPrompt } from '@/lib/memory/retrieve';

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
});
