import { prisma } from '@/lib/db';

/** Max characters for the formatted rules prompt (~4K tokens). */
const MAX_RULES_CHARS = 16_000;

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
    take: 200,
  });

  const settings = await prisma.userRuleSetting.findMany({
    where: { userId },
  });
  const settingsMap = new Map(settings.map((s) => [s.ruleId, s.enabled]));

  const effectiveRules = allRules.filter((rule) => {
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
    // Apply character budget to prevent unbounded system prompt growth
    const lines: string[] = [];
    let charCount = 0;
    for (let i = 0; i < ruleTexts.length; i++) {
      const line = `${i + 1}. ${ruleTexts[i]}`;
      if (charCount + line.length + 1 > MAX_RULES_CHARS) break;
      lines.push(line);
      charCount += line.length + 1;
    }
    return lines.join('\n');
  }

  return ruleTexts;
}
