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
  source: string,
  userId?: string,
) {
  const resolvedUserId = userId ?? null;
  return prisma.memory.upsert({
    where: { orgId_userId_key: { orgId, userId: resolvedUserId, key } },
    update: { value, source },
    create: { orgId, userId: resolvedUserId, key, value, source },
  });
}

export async function updateMemory(
  id: string,
  data: { key?: string; value?: string; source?: string },
) {
  return prisma.memory.update({ where: { id }, data });
}

export async function deleteMemory(id: string) {
  return prisma.memory.delete({ where: { id } });
}
