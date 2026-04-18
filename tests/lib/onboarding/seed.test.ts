import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  memory: {
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  conversation: {
    findFirst: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { buildSeedMessage, getExistingOnboardingConversation } from '@/lib/onboarding/seed';

describe('buildSeedMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns first-user message when no org memories exist', async () => {
    mockPrisma.memory.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      name: 'Alice',
      org: { name: 'Grace Church' },
    });

    const result = await buildSeedMessage('user-1', 'org-1');

    expect(result).toContain('Hey Alice!');
    expect(result).toContain("I'm Service Planner");
    expect(result).toContain('I\'d love to learn a little about you and your church');
    expect(result).not.toContain('I already know a bit about');
  });

  it('returns subsequent-user message when org memories exist (includes church name)', async () => {
    mockPrisma.memory.count.mockResolvedValue(3);
    mockPrisma.user.findUnique.mockResolvedValue({
      name: 'Bob',
      org: { name: 'Grace Church' },
    });

    const result = await buildSeedMessage('user-2', 'org-1');

    expect(result).toContain('Hey Bob!');
    expect(result).toContain("I'm Service Planner");
    expect(result).toContain('I already know a bit about Grace Church');
    expect(result).not.toContain('I\'d love to learn a little about you and your church');
  });

  it('falls back to "Hey there!" when user has no name', async () => {
    mockPrisma.memory.count.mockResolvedValue(0);
    mockPrisma.user.findUnique.mockResolvedValue({
      name: null,
      org: { name: 'Hope Community' },
    });

    const result = await buildSeedMessage('user-3', 'org-1');

    expect(result).toContain('Hey there!');
    expect(result).not.toMatch(/Hey !/);
  });
});

describe('getExistingOnboardingConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns conversation id when one exists', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });

    const result = await getExistingOnboardingConversation('user-1');

    expect(result).toBe('conv-123');
    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', title: 'Getting Started' },
      select: { id: true },
    });
  });

  it('returns null when no onboarding conversation exists', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const result = await getExistingOnboardingConversation('user-1');

    expect(result).toBeNull();
  });
});
