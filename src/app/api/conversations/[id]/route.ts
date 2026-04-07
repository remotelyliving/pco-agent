import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const conversation = await prisma.conversation.findUnique({
    where: { id, userId: session.user.agentUserId },
  });

  if (!conversation) {
    return new Response('Not found', { status: 404 });
  }

  // Messages cascade-delete due to onDelete: Cascade
  await prisma.conversation.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
