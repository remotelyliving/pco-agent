import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  memory: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  getOrgMemories,
  getUserMemories,
  getAllMemoriesForUser,
  upsertMemory,
  updateMemory,
  deleteMemory,
} from '@/lib/memory/queries';

describe('memory queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrgMemories', () => {
    it('returns only org-level memories (userId IS NULL)', async () => {
      const orgMemories = [
        { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
      ];
      mockPrisma.memory.findMany.mockResolvedValue(orgMemories);

      const result = await getOrgMemories('org-1');
      expect(result).toEqual(orgMemories);
      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', userId: null },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('getUserMemories', () => {
    it('returns only user-level memories for the given user', async () => {
      const userMemories = [
        { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'preferred_contact', value: 'email', source: 'auto' },
      ];
      mockPrisma.memory.findMany.mockResolvedValue(userMemories);

      const result = await getUserMemories('org-1', 'user-1');
      expect(result).toEqual(userMemories);
      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('getAllMemoriesForUser', () => {
    it('returns both org-level and user-level memories', async () => {
      const combined = [
        { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
        { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'preferred_contact', value: 'email', source: 'auto' },
      ];
      mockPrisma.memory.findMany.mockResolvedValue(combined);

      const result = await getAllMemoriesForUser('org-1', 'user-1');
      expect(result).toEqual(combined);
      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
        where: {
          orgId: 'org-1',
          OR: [{ userId: null }, { userId: 'user-1' }],
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('upsertMemory', () => {
    it('creates an org-level memory when userId is not provided', async () => {
      const newMemory = { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' };
      mockPrisma.memory.upsert.mockResolvedValue(newMemory);

      const result = await upsertMemory('org-1', 'pastor_name', 'John Smith', 'auto');
      expect(result).toEqual(newMemory);
      expect(mockPrisma.memory.upsert).toHaveBeenCalledWith({
        where: { orgId_userId_key: { orgId: 'org-1', userId: null, key: 'pastor_name' } },
        update: { value: 'John Smith', source: 'auto' },
        create: { orgId: 'org-1', userId: null, key: 'pastor_name', value: 'John Smith', source: 'auto' },
      });
    });

    it('creates a user-level memory when userId is provided', async () => {
      const newMemory = { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'pref', value: 'email', source: 'manual' };
      mockPrisma.memory.upsert.mockResolvedValue(newMemory);

      const result = await upsertMemory('org-1', 'pref', 'email', 'manual', 'user-1');
      expect(result).toEqual(newMemory);
      expect(mockPrisma.memory.upsert).toHaveBeenCalledWith({
        where: { orgId_userId_key: { orgId: 'org-1', userId: 'user-1', key: 'pref' } },
        update: { value: 'email', source: 'manual' },
        create: { orgId: 'org-1', userId: 'user-1', key: 'pref', value: 'email', source: 'manual' },
      });
    });
  });

  describe('updateMemory', () => {
    it('updates the memory by id', async () => {
      mockPrisma.memory.update.mockResolvedValue({ id: 'm1', key: 'pastor_name', value: 'Jane Doe' });

      await updateMemory('m1', { value: 'Jane Doe' });
      expect(mockPrisma.memory.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { value: 'Jane Doe' },
      });
    });
  });

  describe('deleteMemory', () => {
    it('deletes the memory by id', async () => {
      mockPrisma.memory.delete.mockResolvedValue({ id: 'm1' });

      await deleteMemory('m1');
      expect(mockPrisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
