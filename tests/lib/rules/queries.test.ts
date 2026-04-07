import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  rule: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userRuleSetting: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  listRulesForOrg,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  getUserRuleSettings,
} from '@/lib/rules/queries';

describe('rule queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listRulesForOrg returns system + org rules', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system' },
      { id: 'r2', content: 'Org rule', ruleType: 'org' },
    ]);

    const rules = await listRulesForOrg('org-1');
    expect(rules).toHaveLength(2);
    expect(mockPrisma.rule.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ruleType: 'system' },
          { orgId: 'org-1' },
        ],
      },
      orderBy: [{ ruleType: 'asc' }, { sortOrder: 'asc' }],
    });
  });

  it('createRule creates an org rule', async () => {
    mockPrisma.rule.create.mockResolvedValue({
      id: 'new-1', content: 'New rule', ruleType: 'org', orgId: 'org-1',
    });

    const rule = await createRule({
      content: 'New rule',
      ruleType: 'org',
      orgId: 'org-1',
      createdById: 'user-1',
      category: 'general',
    });
    expect(rule.content).toBe('New rule');
  });

  it('updateRule updates content', async () => {
    mockPrisma.rule.update.mockResolvedValue({ id: 'r1', content: 'Updated' });

    await updateRule('r1', { content: 'Updated' });
    expect(mockPrisma.rule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { content: 'Updated' },
    });
  });

  it('deleteRule deletes rule', async () => {
    mockPrisma.rule.delete.mockResolvedValue({ id: 'r1' });

    await deleteRule('r1');
    expect(mockPrisma.rule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('toggleRule upserts a user rule setting', async () => {
    mockPrisma.userRuleSetting.upsert.mockResolvedValue({
      userId: 'user-1', ruleId: 'r1', enabled: false,
    });

    await toggleRule('user-1', 'r1', false);
    expect(mockPrisma.userRuleSetting.upsert).toHaveBeenCalledWith({
      where: { userId_ruleId: { userId: 'user-1', ruleId: 'r1' } },
      update: { enabled: false },
      create: { userId: 'user-1', ruleId: 'r1', enabled: false },
    });
  });

  it('getUserRuleSettings returns settings map', async () => {
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { ruleId: 'r1', enabled: true },
      { ruleId: 'r2', enabled: false },
    ]);

    const settings = await getUserRuleSettings('user-1');
    expect(settings).toEqual({ r1: true, r2: false });
  });
});
