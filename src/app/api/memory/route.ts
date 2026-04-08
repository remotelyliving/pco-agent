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

  try {
    const body = await req.json();
    const { key, value } = body as { key: string; value: string };

    if (!key || !value) {
      return new Response('Key and value are required', { status: 400 });
    }

    if (key.length > 200) {
      return Response.json(
        { error: 'Fact name must be under 200 characters.' },
        { status: 400 },
      );
    }
    if (value.length > 2000) {
      return Response.json(
        { error: 'Fact value must be under 2,000 characters.' },
        { status: 400 },
      );
    }

    const memory = await upsertMemory(session.user.orgId, key, value, MemorySource.manual);
    return Response.json(memory, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    log.error('[memory] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
