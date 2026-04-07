import { auth } from '@/lib/auth';
import { listRulesForOrg, createRule, getUserRuleSettings } from '@/lib/rules/queries';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rules = await listRulesForOrg(session.user.orgId);
  const settings = await getUserRuleSettings(session.user.agentUserId);

  return Response.json({ rules, settings });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Only admins can create org rules
  const body = await req.json();
  const { content, ruleType, category } = body as {
    content: string;
    ruleType: string;
    category?: string;
  };

  if (!content) {
    return new Response('Content is required', { status: 400 });
  }

  // Non-admins can only create personal rules
  const effectiveRuleType = session.user.role === 'admin' ? (ruleType || 'org') : 'user';

  const rule = await createRule({
    content,
    ruleType: effectiveRuleType,
    orgId: session.user.orgId,
    createdById: session.user.agentUserId,
    category,
    visibility: effectiveRuleType === 'user' ? 'private' : 'org',
  });

  return Response.json(rule, { status: 201 });
}
