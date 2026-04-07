import { auth } from '@/lib/auth';
import { toggleRule } from '@/lib/rules/queries';
import { prisma } from '@/lib/db';

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

  // Verify the rule belongs to the user's org
  const rule = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!rule) {
    return new Response('Rule not found', { status: 404 });
  }
  if (rule.orgId && rule.orgId !== session.user.orgId) {
    return new Response('Forbidden', { status: 403 });
  }

  const setting = await toggleRule(session.user.agentUserId, ruleId, enabled);
  return Response.json(setting);
}
