import { auth } from '@/lib/auth';
import { getOrgMemories, upsertMemory } from '@/lib/memory/queries';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const memories = await getOrgMemories(session.user.orgId);
    return Response.json({ memories });
  } catch (error) {
    console.error('[memory] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
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
    const memory = await upsertMemory(session.user.orgId, key, value, 'manual');
    return Response.json(memory, { status: 201 });
  } catch (error) {
    console.error('[memory] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
