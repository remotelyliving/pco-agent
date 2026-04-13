import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockUpsertMemory = vi.hoisted(() => vi.fn());
const mockDeleteAutoMemoryByKey = vi.hoisted(() => vi.fn());
const mockEnforceUserMemoryCap = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetAllMemoriesForUser = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@/lib/memory/queries', () => ({
  getAllMemoriesForUser: mockGetAllMemoriesForUser,
  upsertMemory: mockUpsertMemory,
  deleteAutoMemoryByKey: mockDeleteAutoMemoryByKey,
  enforceUserMemoryCap: mockEnforceUserMemoryCap,
}));

import { extractAndSaveMemories, DELETE_SENTINEL } from '@/lib/memory/extract';

describe('extractAndSaveMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllMemoriesForUser.mockResolvedValue([]);
    mockDeleteAutoMemoryByKey.mockResolvedValue(true);
  });

  it('calls generateObject with the conversation messages', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [{ key: 'pastor_name', value: 'John Smith' }] },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1', 'user-1',
      'What is the pastor name?', 'The pastor is John Smith.',
      'anthropic', 'test-api-key',
    );

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain('What is the pastor name?');
    expect(call.prompt).toContain('The pastor is John Smith.');
  });

  it('saves all extracted facts as user-scoped memories', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        facts: [
          { key: 'pastor_name', value: 'John Smith' },
          { key: 'sunday_service_time', value: '10:00 AM' },
        ],
      },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1', 'user-1',
      'Tell me about services', 'Pastor John Smith leads services at 10:00 AM.',
      'anthropic', 'test-api-key',
    );

    expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'pastor_name', 'John Smith', 'auto', 'user-1');
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'sunday_service_time', '10:00 AM', 'auto', 'user-1');
  });

  it('does nothing when no facts are extracted', async () => {
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Hello', 'Hi there!', 'anthropic', 'test-api-key',
    );

    expect(mockUpsertMemory).not.toHaveBeenCalled();
    expect(mockEnforceUserMemoryCap).not.toHaveBeenCalled();
  });

  it('truncates long messages to prevent context overflow', async () => {
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });
    const longMessage = 'x'.repeat(5000);

    await extractAndSaveMemories(
      'org-1', 'user-1', longMessage, longMessage, 'anthropic', 'test-api-key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).not.toContain('x'.repeat(5000));
    expect(call.prompt).toContain('... [truncated]');
  });

  it('wraps messages in XML tags to mitigate prompt injection', async () => {
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Hello', 'Hi there!', 'anthropic', 'test-api-key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain('<user_message>Hello</user_message>');
    expect(call.prompt).toContain('<assistant_message>Hi there!</assistant_message>');
  });

  it('throws when generateObject errors (outer caller handles)', async () => {
    mockGenerateObject.mockRejectedValue(new Error('API error'));

    await expect(
      extractAndSaveMemories('org-1', 'user-1', 'Hello', 'Hi!', 'anthropic', 'key'),
    ).rejects.toThrow('API error');

    expect(mockUpsertMemory).not.toHaveBeenCalled();
  });

  it('enforces user memory cap after extracting facts', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [{ key: 'pastor_name', value: 'John Smith' }] },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Who is pastor?', 'John Smith.', 'anthropic', 'key',
    );

    expect(mockEnforceUserMemoryCap).toHaveBeenCalledWith('org-1', 'user-1');
  });

  it('skips cap enforcement when no facts are extracted', async () => {
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });

    await extractAndSaveMemories('org-1', 'user-1', 'Hi', 'Hey!', 'anthropic', 'key');

    expect(mockEnforceUserMemoryCap).not.toHaveBeenCalled();
  });

  // --- Staleness detection tests ---

  it('includes existing memories in the extraction prompt', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { key: 'worship_leader', value: 'Sarah Jones', userId: 'user-1', orgId: 'org-1', source: 'auto' },
      { key: 'service_time', value: '9:00 AM', userId: null, orgId: 'org-1', source: 'manual' },
    ]);
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Hello', 'Hi!', 'anthropic', 'key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain('<existing_facts>');
    expect(call.prompt).toContain('worship_leader: Sarah Jones');
    expect(call.prompt).toContain('service_time: 9:00 AM');
    expect(call.prompt).toContain('__DELETE__');
  });

  it('does not include existing_facts section when no memories exist', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([]);
    mockGenerateObject.mockResolvedValue({ object: { facts: [] } });

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Hello', 'Hi!', 'anthropic', 'key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).not.toContain('<existing_facts>');
  });

  it('deletes facts marked with __DELETE__ sentinel', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        facts: [
          { key: 'old_worship_leader', value: DELETE_SENTINEL },
          { key: 'new_worship_leader', value: 'Mike Brown' },
        ],
      },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1', 'user-1', 'Who leads worship now?', 'Mike Brown took over.',
      'anthropic', 'key',
    );

    expect(mockDeleteAutoMemoryByKey).toHaveBeenCalledWith('org-1', 'user-1', 'old_worship_leader');
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'new_worship_leader', 'Mike Brown', 'auto', 'user-1');
    expect(mockUpsertMemory).toHaveBeenCalledTimes(1);
  });

  it('handles mix of updates, new facts, and deletions', async () => {
    mockGetAllMemoriesForUser.mockResolvedValue([
      { key: 'team_count', value: '5', userId: 'user-1', orgId: 'org-1', source: 'auto' },
    ]);
    mockGenerateObject.mockResolvedValue({
      object: {
        facts: [
          { key: 'team_count', value: '6' },           // update existing
          { key: 'newest_member', value: 'Alex' },      // new fact
          { key: 'old_fact', value: DELETE_SENTINEL },   // delete
        ],
      },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1', 'user-1', 'I added Alex to the team', 'Done! Team now has 6 members.',
      'anthropic', 'key',
    );

    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'team_count', '6', 'auto', 'user-1');
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'newest_member', 'Alex', 'auto', 'user-1');
    expect(mockDeleteAutoMemoryByKey).toHaveBeenCalledWith('org-1', 'user-1', 'old_fact');
    expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
    expect(mockDeleteAutoMemoryByKey).toHaveBeenCalledTimes(1);
  });
});
