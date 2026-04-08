import { MemorySource } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function getOrgMemories(orgId: string) {
  return prisma.memory.findMany({
    where: { orgId, userId: null },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getUserMemories(orgId: string, userId: string) {
  return prisma.memory.findMany({
    where: { orgId, userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getAllMemoriesForUser(orgId: string, userId: string) {
  return prisma.memory.findMany({
    where: {
      orgId,
      OR: [{ userId: null }, { userId }],
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function upsertMemory(
  orgId: string,
  key: string,
  value: string,
  source: MemorySource = MemorySource.auto,
  userId?: string,
) {
  if (userId) {
    // User-scoped: check manual-vs-auto protection before upserting
    const existing = await prisma.memory.findFirst({
      where: { orgId, userId, key },
    });
    if (existing && existing.source === 'manual' && source === 'auto') {
      return existing;
    }
    return prisma.memory.upsert({
      where: { orgId_userId_key: { orgId, userId, key } },
      update: { value, source },
      create: { orgId, userId, key, value, source },
    });
  }

  // Org-scoped (userId=null): unique constraint doesn't enforce uniqueness for NULLs
  // Use findFirst + create/update to prevent duplicates
  const existing = await prisma.memory.findFirst({
    where: { orgId, userId: null, key },
  });

  if (existing) {
    // Don't overwrite manually-set facts with auto-extracted ones
    if (existing.source === 'manual' && source === 'auto') {
      return existing;
    }
    return prisma.memory.update({
      where: { id: existing.id },
      data: { value, source },
    });
  }

  return prisma.memory.create({
    data: { orgId, key, value, source },
  });
}

export async function updateMemory(
  id: string,
  orgId: string,
  data: { key?: string; value?: string; source?: MemorySource },
) {
  return prisma.memory.update({ where: { id, orgId }, data });
}

export async function deleteMemory(id: string, orgId: string) {
  return prisma.memory.delete({ where: { id, orgId } });
}

export async function enforceMemoryCap(orgId: string, maxCount: number = 200): Promise<void> {
  const count = await prisma.memory.count({ where: { orgId } });
  if (count <= maxCount) return;

  const excess = count - maxCount;
  const oldestAuto = await prisma.memory.findMany({
    where: { orgId, source: 'auto' },
    orderBy: { updatedAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (oldestAuto.length > 0) {
    await prisma.memory.deleteMany({
      where: { id: { in: oldestAuto.map((m) => m.id) } },
    });
  }
}
