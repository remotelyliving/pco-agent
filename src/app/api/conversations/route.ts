import { auth } from '@/lib/auth';
import { createConversation } from '@/lib/chat/persist';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

export async function POST() {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const conversation = await createConversation(session.user.agentUserId);
    return Response.json({ id: conversation.id });
  } catch (error) {
    log.error('[conversations] Create error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
