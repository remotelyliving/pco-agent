import { auth } from '@/lib/auth';
import { updateMemory, deleteMemory } from '@/lib/memory/queries';
import { prisma } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;

  const memory = await prisma.memory.findUnique({ where: { id } });
  if (!memory) return new Response('Not found', { status: 404 });

  if (memory.orgId !== session.user.orgId) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await req.json();
  const updated = await updateMemory(id, {
    key: body.key,
    value: body.value,
  });

  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;

  const memory = await prisma.memory.findUnique({ where: { id } });
  if (!memory) return new Response('Not found', { status: 404 });

  if (memory.orgId !== session.user.orgId) {
    return new Response('Forbidden', { status: 403 });
  }

  await deleteMemory(id);
  return new Response(null, { status: 204 });
}
