import { auth } from '@/lib/auth';
import { updateMemory, deleteMemory } from '@/lib/memory/queries';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const memory = await prisma.memory.findUnique({ where: { id } });
    if (!memory) return new Response('Not found', { status: 404 });

    if (memory.orgId !== session.user.orgId) {
      return new Response('Forbidden', { status: 403 });
    }

    const isOwner = memory.userId === session.user.agentUserId;
    if (session.user.role !== 'admin' && !isOwner) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await req.json();

    if (body.key !== undefined && (typeof body.key !== 'string' || body.key.length > 200)) {
      return Response.json({ error: 'Fact name must be a string under 200 characters.' }, { status: 400 });
    }
    if (body.value !== undefined && (typeof body.value !== 'string' || body.value.length > 2000)) {
      return Response.json({ error: 'Fact value must be a string under 2,000 characters.' }, { status: 400 });
    }

    const updated = await updateMemory(id, session.user.orgId, {
      key: body.key,
      value: body.value,
    });

    return Response.json(updated);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    log.error('[memory/id] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const memory = await prisma.memory.findUnique({ where: { id } });
    if (!memory) return new Response('Not found', { status: 404 });

    if (memory.orgId !== session.user.orgId) {
      return new Response('Forbidden', { status: 403 });
    }

    const isOwner = memory.userId === session.user.agentUserId;
    if (session.user.role !== 'admin' && !isOwner) {
      return new Response('Forbidden', { status: 403 });
    }

    await deleteMemory(id, session.user.orgId);
    return new Response(null, { status: 204 });
  } catch (error) {
    log.error('[memory/id] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
