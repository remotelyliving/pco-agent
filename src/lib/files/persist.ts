import { prisma } from '@/lib/db';
import { getFileStore } from '@/lib/files/store';
import { logger } from '@/lib/logger';

export async function createFileRecord(data: {
  userId: string;
  orgId: string;
  conversationId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  storageKey: string;
}) {
  return prisma.file.create({ data });
}

export async function getFileRecord(id: string) {
  return prisma.file.findUnique({ where: { id } });
}

/** Total storage bytes used by a user across all conversations. */
export async function getUserStorageBytes(userId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}

export async function getFilesByConversation(conversationId: string) {
  return prisma.file.findMany({ where: { conversationId } });
}

/** Delete a file from storage and DB. Callers must verify ownership before calling. */
export async function deleteFileRecord(id: string) {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return;

  const store = getFileStore();
  await store.delete(file.storageKey);
  await prisma.file.delete({ where: { id } });
}

export async function deleteConversationWithFiles(conversationId: string) {
  const store = getFileStore();

  // Query and delete DB records inside transaction
  const storageKeys = await prisma.$transaction(async (tx) => {
    const files = await tx.file.findMany({
      where: { conversationId },
      select: { storageKey: true },
    });
    await tx.file.deleteMany({ where: { conversationId } });
    await tx.conversation.delete({ where: { id: conversationId } });
    return files.map((f) => f.storageKey);
  });

  // Delete from file store outside transaction (best-effort)
  for (const key of storageKeys) {
    try {
      await store.delete(key);
    } catch (err) {
      logger.warn('[files] Failed to delete file from store', {
        storageKey: key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
