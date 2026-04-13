import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockUpsertMemory = vi.hoisted(() => vi.fn());
const mockEnforceUserMemoryCap = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@/lib/memory/queries', () => ({
  upsertMemory: mockUpsertMemory,
  enforceUserMemoryCap: mockEnforceUserMemoryCap,
}));

import { extractAndSaveMemories } from '@/lib/memory/extract';

describe('extractAndSaveMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateObject with the conversation messages', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [{ key: 'pastor_name', value: 'John Smith' }] },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1',
      'user-1',
      'What is the pastor name?',
      'The pastor is John Smith.',
      'anthropic',
      'test-api-key',
    );

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const call = mockGenerateObject.mock.calls[0][0];
    expect(call).toHaveProperty('prompt');
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
      'org-1',
      'user-1',
      'Tell me about services',
      'Pastor John Smith leads services at 10:00 AM on Sundays.',
      'anthropic',
      'test-api-key',
    );

    expect(mockUpsertMemory).toHaveBeenCalledTimes(2);
    // All auto-extracted facts are user-scoped (userId always passed)
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'pastor_name', 'John Smith', 'auto', 'user-1');
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'sunday_service_time', '10:00 AM', 'auto', 'user-1');
  });

  it('does nothing when no facts are extracted', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
    });

    await extractAndSaveMemories(
      'org-1',
      'user-1',
      'Hello',
      'Hi there!',
      'anthropic',
      'test-api-key',
    );

    expect(mockUpsertMemory).not.toHaveBeenCalled();
    expect(mockEnforceUserMemoryCap).not.toHaveBeenCalled();
  });

  it('truncates long messages to prevent context overflow', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
    });

    const longMessage = 'x'.repeat(5000);

    await extractAndSaveMemories(
      'org-1',
      'user-1',
      longMessage,
      longMessage,
      'anthropic',
      'test-api-key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).not.toContain('x'.repeat(5000));
    expect(call.prompt).toContain('... [truncated]');
  });

  it('wraps messages in XML tags to mitigate prompt injection', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
    });

    await extractAndSaveMemories(
      'org-1',
      'user-1',
      'Hello',
      'Hi there!',
      'anthropic',
      'test-api-key',
    );

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain('<user_message>Hello</user_message>');
    expect(call.prompt).toContain('<assistant_message>Hi there!</assistant_message>');
  });

  it('throws when generateObject errors (outer caller handles)', async () => {
    mockGenerateObject.mockRejectedValue(new Error('API error'));

    await expect(
      extractAndSaveMemories(
        'org-1',
        'user-1',
        'Hello',
        'Hi there!',
        'anthropic',
        'test-api-key',
      ),
    ).rejects.toThrow('API error');

    expect(mockUpsertMemory).not.toHaveBeenCalled();
  });

  it('enforces user memory cap after extracting facts', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [{ key: 'pastor_name', value: 'John Smith' }] },
    });
    mockUpsertMemory.mockResolvedValue({});

    await extractAndSaveMemories(
      'org-1',
      'user-1',
      'What is the pastor name?',
      'The pastor is John Smith.',
      'anthropic',
      'test-api-key',
    );

    expect(mockEnforceUserMemoryCap).toHaveBeenCalledWith('org-1', 'user-1');
  });

  it('skips cap enforcement when no facts are extracted', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { facts: [] },
    });

    await extractAndSaveMemories('org-1', 'user-1', 'Be concise', 'Sure.', 'anthropic', 'key');

    expect(mockEnforceUserMemoryCap).not.toHaveBeenCalled();
  });
});
