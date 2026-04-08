import { RuleType, RuleVisibility } from '@prisma/client';
import { auth, canManageRules } from '@/lib/auth';
import { listRulesForOrg, createRule, getUserRuleSettings } from '@/lib/rules/queries';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
export async function GET() {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId || !session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const rules = await listRulesForOrg(session.user.orgId, session.user.agentUserId);
    const settings = await getUserRuleSettings(session.user.agentUserId);

    return Response.json({ rules, settings });
  } catch (error) {
    log.error('[rules] Database error', { error: error instanceof Error ? error.message : String(error) });
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

  if (content.length > 2000) {
    return Response.json(
      { error: 'Rule content must be under 2,000 characters.' },
      { status: 400 },
    );
  }

  // Non-admins can only create personal rules
  const effectiveRuleType = canManageRules(session.user.role) ? (ruleType || 'org') : 'user';

  const ALLOWED_RULE_TYPES: RuleType[] = [RuleType.org, RuleType.user];
  if (!ALLOWED_RULE_TYPES.includes(effectiveRuleType as RuleType)) {
    return Response.json({ error: 'Invalid rule type' }, { status: 400 });
  }

  try {
    const rule = await createRule({
      content,
      ruleType: effectiveRuleType as RuleType,
      orgId: session.user.orgId,
      createdById: session.user.agentUserId,
      category,
      visibility: effectiveRuleType === RuleType.user ? RuleVisibility.private : RuleVisibility.org,
    });

    return Response.json(rule, { status: 201 });
  } catch (error) {
    log.error('[rules] Database error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
