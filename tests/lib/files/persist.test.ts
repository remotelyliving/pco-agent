import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    file: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    conversation: {
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      file: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
      conversation: {
        delete: vi.fn(),
      },
    })),
  },
}));

vi.mock('@/lib/files/store', () => ({
  getFileStore: vi.fn(() => ({
    delete: vi.fn(),
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { createFileRecord, getFileRecord, deleteConversationWithFiles } from '@/lib/files/persist';
import { prisma } from '@/lib/db';

describe('createFileRecord', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a file record in the database', async () => {
    const mockFile = {
      id: 'file-1', userId: 'user-1', orgId: 'org-1', conversationId: 'conv-1',
      filename: 'test.csv', mediaType: 'text/csv', sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv', createdAt: new Date(),
    };
    vi.mocked(prisma.file.create).mockResolvedValue(mockFile);

    const result = await createFileRecord({
      userId: 'user-1', orgId: 'org-1', conversationId: 'conv-1',
      filename: 'test.csv', mediaType: 'text/csv', sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv',
    });

    expect(prisma.file.create).toHaveBeenCalledOnce();
    expect(result.id).toBe('file-1');
  });
});

describe('getFileRecord', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns file record by id', async () => {
    const mockFile = {
      id: 'file-1', userId: 'user-1', orgId: 'org-1', conversationId: 'conv-1',
      filename: 'test.csv', mediaType: 'text/csv', sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv', createdAt: new Date(),
    };
    vi.mocked(prisma.file.findUnique).mockResolvedValue(mockFile);

    const result = await getFileRecord('file-1');
    expect(result).toEqual(mockFile);
  });
});

describe('deleteConversationWithFiles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls transaction to delete files from store then DB', async () => {
    await deleteConversationWithFiles('conv-1');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
