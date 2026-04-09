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

export async function getFilesByConversation(conversationId: string) {
  return prisma.file.findMany({ where: { conversationId } });
}

export async function deleteFileRecord(id: string) {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return;

  const store = getFileStore();
  await store.delete(file.storageKey);
  await prisma.file.delete({ where: { id } });
}

export async function deleteConversationWithFiles(conversationId: string) {
  const store = getFileStore();

  await prisma.$transaction(async (tx) => {
    const files = await tx.file.findMany({
      where: { conversationId },
      select: { storageKey: true },
    });

    for (const file of files) {
      try {
        await store.delete(file.storageKey);
      } catch (err) {
        logger.warn('[files] Failed to delete file from store', {
          storageKey: file.storageKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await tx.file.deleteMany({ where: { conversationId } });
    await tx.conversation.delete({ where: { id: conversationId } });
  });
}
