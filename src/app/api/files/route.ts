import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getFileStore } from '@/lib/files/store';
import { validateFile, sanitizeFilename, getExtension } from '@/lib/files/validate';
import { createFileRecord, getUserStorageBytes } from '@/lib/files/persist';
import { EXTENSION_TO_MIME, MAX_USER_STORAGE_BYTES } from '@/lib/files/types';
import type { AllowedExtension } from '@/lib/files/types';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Verify conversation ownership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.agentUserId },
    });
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    const validation = validateFile(file.name, data.length, data);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Check per-user storage quota
    const currentUsage = await getUserStorageBytes(session.user.agentUserId);
    if (currentUsage + data.length > MAX_USER_STORAGE_BYTES) {
      return Response.json(
        { error: "You've reached your storage limit (500 MB). Delete some old conversations to free up space." },
        { status: 413 },
      );
    }

    const cleanName = sanitizeFilename(file.name);
    const ext = getExtension(cleanName) as AllowedExtension;
    const mediaType = EXTENSION_TO_MIME[ext] || 'application/octet-stream';

    const uuid = randomUUID();
    const storageKey = `${session.user.orgId}/${session.user.agentUserId}/${uuid}${ext}`;
    const store = getFileStore();

    await store.put(storageKey, data, {
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
      userId: session.user.agentUserId,
      orgId: session.user.orgId,
      conversationId,
    });

    let record;
    try {
      record = await createFileRecord({
        userId: session.user.agentUserId,
        orgId: session.user.orgId,
        conversationId,
        filename: cleanName,
        mediaType,
        sizeBytes: data.length,
        storageKey,
      });
    } catch (dbError) {
      // Compensating delete — don't leave orphaned files
      await store.delete(storageKey).catch(() => {});
      throw dbError;
    }

    log.info('[files] Upload complete', {
      fileId: record.id,
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
      conversationId,
    });

    return Response.json({
      fileId: record.id,
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
    });
  } catch (error) {
    log.error('[files] Upload error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    );
  }
}
