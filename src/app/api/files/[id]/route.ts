import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getFileRecord, deleteFileRecord } from '@/lib/files/persist';
import { getFileStore } from '@/lib/files/store';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const file = await getFileRecord(id);
    if (!file) {
      return new Response('Not found', { status: 404 });
    }

    const isOwner = file.userId === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin' && file.orgId === session.user.orgId;
    if (!isOwner && !isAdmin) {
      return new Response('Not found', { status: 404 });
    }

    const store = getFileStore();
    const result = await store.get(file.storageKey);
    if (!result) {
      log.error('[files] File exists in DB but not in store', { fileId: id, storageKey: file.storageKey });
      return new Response('File not found in storage', { status: 404 });
    }

    return new Response(new Uint8Array(result.data), {
      headers: {
        'Content-Type': file.mediaType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
        'Content-Length': String(result.data.length),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    log.error('[files] Download error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: 'Download failed' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const file = await getFileRecord(id);
    if (!file) {
      return new Response('Not found', { status: 404 });
    }

    const isOwner = file.userId === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin' && file.orgId === session.user.orgId;
    if (!isOwner && !isAdmin) {
      return new Response('Not found', { status: 404 });
    }

    await deleteFileRecord(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    log.error('[files] Delete error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
}
