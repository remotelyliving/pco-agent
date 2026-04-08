import { MemorySource } from '@prisma/client';
import { auth } from '@/lib/auth';
import { getOrgMemories, getUserMemories, upsertMemory } from '@/lib/memory/queries';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';

const MEMORY_LIMIT = 100;

export async function GET() {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.orgId || !session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const [orgMemoriesAll, userMemoriesAll] = await Promise.all([
      getOrgMemories(session.user.orgId),
      getUserMemories(session.user.orgId, session.user.agentUserId),
    ]);
    const orgMemories = orgMemoriesAll.slice(0, MEMORY_LIMIT);
    const userMemories = userMemoriesAll.slice(0, MEMORY_LIMIT);
    return Response.json({ orgMemories, userMemories });
  } catch (error) {
    log.error('[memory] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body as { key: string; value: string };

  if (!key || !value) {
    return new Response('Key and value are required', { status: 400 });
  }

  try {
    const memory = await upsertMemory(session.user.orgId, key, value, MemorySource.manual);
    return Response.json(memory, { status: 201 });
  } catch (error) {
    log.error('[memory] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
