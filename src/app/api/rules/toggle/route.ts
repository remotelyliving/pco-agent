import { auth } from '@/lib/auth';
import { toggleRule } from '@/lib/rules/queries';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { ruleId, enabled } = body as { ruleId: string; enabled: boolean };

  if (!ruleId || typeof enabled !== 'boolean') {
    return new Response('ruleId and enabled are required', { status: 400 });
  }

  const setting = await toggleRule(session.user.agentUserId, ruleId, enabled);
  return Response.json(setting);
}
