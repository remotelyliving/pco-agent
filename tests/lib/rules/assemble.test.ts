import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  rule: { findMany: vi.fn() },
  userRuleSetting: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { assembleRules } from '@/lib/rules/assemble';

describe('assembleRules', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns system rules when user has no overrides', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Check blockout dates', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 0 },
      { id: 'r2', content: 'Confirm before changes', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe('Check blockout dates');
  });

  it('includes org rules', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'System rule', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 0 },
      { id: 'r2', content: 'Org rule', ruleType: 'org', visibility: 'org', orgId: 'org-1', createdById: 'admin-1', sortOrder: 0 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('Org rule');
  });

  it('includes user own private rules', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r3', content: 'My rule', ruleType: 'user', visibility: 'private', orgId: 'org-1', createdById: 'user-1', sortOrder: 0 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('My rule');
  });

  it('excludes rules user opted out of', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Enabled', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 0 },
      { id: 'r2', content: 'Disabled', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { userId: 'user-1', ruleId: 'r2', enabled: false },
    ]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('Enabled');
    expect(rules).not.toContain('Disabled');
  });

  it('includes other users public rules only with opt-in', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r4', content: 'Shared rule', ruleType: 'user', visibility: 'org', orgId: 'org-1', createdById: 'other-user', sortOrder: 0 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([
      { userId: 'user-1', ruleId: 'r4', enabled: true },
    ]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).toContain('Shared rule');
  });

  it('excludes other users public rules without opt-in', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r4', content: 'No opt-in', ruleType: 'user', visibility: 'org', orgId: 'org-1', createdById: 'other-user', sortOrder: 0 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules).not.toContain('No opt-in');
  });

  it('sorts by sortOrder', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Second', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 2 },
      { id: 'r2', content: 'First', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const rules = await assembleRules('user-1', 'org-1');
    expect(rules[0]).toBe('First');
    expect(rules[1]).toBe('Second');
  });

  it('formats as numbered list with formatAsPrompt', async () => {
    mockPrisma.rule.findMany.mockResolvedValue([
      { id: 'r1', content: 'Rule one', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 0 },
      { id: 'r2', content: 'Rule two', ruleType: 'system', visibility: 'org', orgId: null, createdById: null, sortOrder: 1 },
    ]);
    mockPrisma.userRuleSetting.findMany.mockResolvedValue([]);
    const prompt = await assembleRules('user-1', 'org-1', { formatAsPrompt: true });
    expect(prompt).toContain('1.');
    expect(prompt).toContain('2.');
  });
});
