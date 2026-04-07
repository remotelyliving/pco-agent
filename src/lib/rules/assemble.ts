import { prisma } from '@/lib/db';

interface AssembleOptions {
  formatAsPrompt?: boolean;
}

export async function assembleRules(
  userId: string,
  orgId: string,
  options?: AssembleOptions,
): Promise<string[] | string> {
  const allRules = await prisma.rule.findMany({
    where: {
      OR: [
        { ruleType: 'system' },
        { ruleType: 'org', orgId },
        { createdById: userId, orgId },
        { ruleType: 'user', visibility: 'org', orgId },
      ],
    },
    orderBy: { sortOrder: 'asc' },
  });

  const settings = await prisma.userRuleSetting.findMany({
    where: { userId },
  });
  const settingsMap = new Map(settings.map((s) => [s.ruleId, s.enabled]));

  const sortedRules = [...allRules].sort((a, b) => a.sortOrder - b.sortOrder);

  const effectiveRules = sortedRules.filter((rule) => {
    const override = settingsMap.get(rule.id);
    if (rule.ruleType === 'system' || rule.ruleType === 'org') {
      return override !== false;
    }
    if (rule.createdById === userId) {
      return override !== false; // own rules on by default, but can be toggled off
    }
    if (rule.ruleType === 'user' && rule.visibility === 'org' && rule.createdById !== userId) {
      return override === true;
    }
    return false;
  });

  const ruleTexts = effectiveRules.map((r) => r.content);

  if (options?.formatAsPrompt) {
    if (ruleTexts.length === 0) return '';
    return ruleTexts.map((text, i) => `${i + 1}. ${text}`).join('\n');
  }

  return ruleTexts;
}
