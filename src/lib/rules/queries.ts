import { RuleType, RuleVisibility } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function listRulesForOrg(orgId: string, userId?: string) {
  return prisma.rule.findMany({
    where: {
      OR: [
        { ruleType: RuleType.system },
        { ruleType: RuleType.org, orgId },
        // User's own rules (any visibility)
        ...(userId ? [{ createdById: userId, orgId }] : []),
        // Other users' public rules only
        { ruleType: RuleType.user, visibility: RuleVisibility.org, orgId },
      ],
    },
    orderBy: [{ ruleType: 'asc' }, { sortOrder: 'asc' }],
  });
}

export async function createRule(data: {
  content: string;
  ruleType: RuleType;
  orgId: string;
  createdById: string;
  category?: string;
  visibility?: RuleVisibility;
}) {
  return prisma.rule.create({
    data: {
      content: data.content,
      ruleType: data.ruleType,
      orgId: data.orgId,
      createdById: data.createdById,
      category: data.category || null,
      visibility: data.visibility ?? RuleVisibility.org,
    },
  });
}

export async function updateRule(
  id: string,
  data: { content?: string; category?: string; sortOrder?: number },
) {
  return prisma.rule.update({
    where: { id },
    data,
  });
}

export async function deleteRule(id: string) {
  return prisma.rule.delete({ where: { id } });
}

export async function toggleRule(userId: string, ruleId: string, enabled: boolean) {
  return prisma.userRuleSetting.upsert({
    where: { userId_ruleId: { userId, ruleId } },
    update: { enabled },
    create: { userId, ruleId, enabled },
  });
}

export async function getUserRuleSettings(userId: string): Promise<Record<string, boolean>> {
  const settings = await prisma.userRuleSetting.findMany({
    where: { userId },
  });
  return Object.fromEntries(settings.map((s) => [s.ruleId, s.enabled]));
}
