import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockUpsertMemory = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@/lib/memory/queries', () => ({
  upsertMemory: mockUpsertMemory,
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

  it('saves extracted facts as org-level memories', async () => {
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
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'pastor_name', 'John Smith', 'auto', undefined);
    expect(mockUpsertMemory).toHaveBeenCalledWith('org-1', 'sunday_service_time', '10:00 AM', 'auto', undefined);
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
  });

  it('does not throw when generateObject errors', async () => {
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
    ).resolves.toBeUndefined();

    expect(mockUpsertMemory).not.toHaveBeenCalled();
  });
});
