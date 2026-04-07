import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

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
  } catch (error) {
    log.error('[conversations/id] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
