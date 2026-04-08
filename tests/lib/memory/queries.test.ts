import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  memory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
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
  enforceMemoryCap,
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
      mockPrisma.memory.findFirst.mockResolvedValue(null);
      mockPrisma.memory.create.mockResolvedValue(newMemory);

      const result = await upsertMemory('org-1', 'pastor_name', 'John Smith', 'auto');
      expect(result).toEqual(newMemory);
      expect(mockPrisma.memory.findFirst).toHaveBeenCalledWith({
        where: { orgId: 'org-1', userId: null, key: 'pastor_name' },
      });
      expect(mockPrisma.memory.create).toHaveBeenCalledWith({
        data: { orgId: 'org-1', key: 'pastor_name', value: 'John Smith', source: 'auto' },
      });
    });

    it('updates an existing org-level memory when one already exists', async () => {
      const existing = { id: 'm1', orgId: 'org-1', userId: null, key: 'pastor_name', value: 'Old Name', source: 'auto' };
      const updated = { ...existing, value: 'John Smith' };
      mockPrisma.memory.findFirst.mockResolvedValue(existing);
      mockPrisma.memory.update.mockResolvedValue(updated);

      const result = await upsertMemory('org-1', 'pastor_name', 'John Smith', 'auto');
      expect(result).toEqual(updated);
      expect(mockPrisma.memory.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { value: 'John Smith', source: 'auto' },
      });
    });

    it('creates a user-level memory when userId is provided', async () => {
      const newMemory = { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'pref', value: 'email', source: 'manual' };
      mockPrisma.memory.findFirst.mockResolvedValue(null);
      mockPrisma.memory.upsert.mockResolvedValue(newMemory);

      const result = await upsertMemory('org-1', 'pref', 'email', 'manual', 'user-1');
      expect(result).toEqual(newMemory);
      expect(mockPrisma.memory.findFirst).toHaveBeenCalledWith({
        where: { orgId: 'org-1', userId: 'user-1', key: 'pref' },
      });
      expect(mockPrisma.memory.upsert).toHaveBeenCalledWith({
        where: { orgId_userId_key: { orgId: 'org-1', userId: 'user-1', key: 'pref' } },
        update: { value: 'email', source: 'manual' },
        create: { orgId: 'org-1', userId: 'user-1', key: 'pref', value: 'email', source: 'manual' },
      });
    });

    it('does not overwrite a manual user-level memory with an auto-extracted one', async () => {
      const existing = { id: 'm2', orgId: 'org-1', userId: 'user-1', key: 'pref', value: 'email', source: 'manual' };
      mockPrisma.memory.findFirst.mockResolvedValue(existing);

      const result = await upsertMemory('org-1', 'pref', 'phone', 'auto', 'user-1');
      expect(result).toEqual(existing);
      expect(mockPrisma.memory.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateMemory', () => {
    it('updates the memory by id scoped to orgId', async () => {
      mockPrisma.memory.update.mockResolvedValue({ id: 'm1', key: 'pastor_name', value: 'Jane Doe' });

      await updateMemory('m1', 'org-1', { value: 'Jane Doe' });
      expect(mockPrisma.memory.update).toHaveBeenCalledWith({
        where: { id: 'm1', orgId: 'org-1' },
        data: { value: 'Jane Doe' },
      });
    });
  });

  describe('deleteMemory', () => {
    it('deletes the memory by id scoped to orgId', async () => {
      mockPrisma.memory.delete.mockResolvedValue({ id: 'm1' });

      await deleteMemory('m1', 'org-1');
      expect(mockPrisma.memory.delete).toHaveBeenCalledWith({ where: { id: 'm1', orgId: 'org-1' } });
    });
  });

  describe('enforceMemoryCap', () => {
    it('does nothing when under the cap', async () => {
      mockPrisma.memory.count.mockResolvedValue(150);
      await enforceMemoryCap('org-1', 200);
      expect(mockPrisma.memory.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.memory.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes oldest auto-sourced memories when over the cap', async () => {
      mockPrisma.memory.count.mockResolvedValue(210);
      mockPrisma.memory.findMany.mockResolvedValue([
        { id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }, { id: 'old-4' }, { id: 'old-5' },
        { id: 'old-6' }, { id: 'old-7' }, { id: 'old-8' }, { id: 'old-9' }, { id: 'old-10' },
      ]);
      mockPrisma.memory.deleteMany.mockResolvedValue({ count: 10 });

      await enforceMemoryCap('org-1', 200);

      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', source: 'auto' },
        orderBy: { updatedAt: 'asc' },
        take: 10,
        select: { id: true },
      });
      expect(mockPrisma.memory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2', 'old-3', 'old-4', 'old-5', 'old-6', 'old-7', 'old-8', 'old-9', 'old-10'] } },
      });
    });

    it('does nothing if no auto memories to delete', async () => {
      mockPrisma.memory.count.mockResolvedValue(205);
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await enforceMemoryCap('org-1', 200);
      expect(mockPrisma.memory.deleteMany).not.toHaveBeenCalled();
    });

    it('uses default cap of 200', async () => {
      mockPrisma.memory.count.mockResolvedValue(150);
      await enforceMemoryCap('org-1');
      expect(mockPrisma.memory.count).toHaveBeenCalledWith({ where: { orgId: 'org-1' } });
    });
  });
});
