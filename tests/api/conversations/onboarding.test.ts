import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRole } from '@prisma/client';

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));
const mockBuildSeedMessage = vi.hoisted(() => vi.fn());
const mockGetExistingOnboardingConversation = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/onboarding/seed', () => ({
  buildSeedMessage: mockBuildSeedMessage,
  getExistingOnboardingConversation: mockGetExistingOnboardingConversation,
}));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import { POST } from '@/app/api/conversations/onboarding/route';

function makeRequest() {
  return new Request('http://localhost/api/conversations/onboarding', { method: 'POST' });
}

describe('POST /api/conversations/onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it('returns existing conversation id on idempotent call', async () => {
    mockAuth.mockResolvedValue({
      user: { agentUserId: 'user-1', orgId: 'org-1' },
    });
    mockGetExistingOnboardingConversation.mockResolvedValue('existing-id');

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversationId: 'existing-id' });
    expect(mockBuildSeedMessage).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates conversation and seed message in a transaction', async () => {
    mockAuth.mockResolvedValue({
      user: { agentUserId: 'user-1', orgId: 'org-1' },
    });
    mockGetExistingOnboardingConversation.mockResolvedValue(null);
    mockBuildSeedMessage.mockResolvedValue('Hey Alice! Welcome to Service Planner.');

    const createdConv = { id: 'new-conv-id' };
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        conversation: {
          create: vi.fn().mockResolvedValue(createdConv),
        },
        message: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(mockTx);
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversationId: 'new-conv-id' });

    expect(mockBuildSeedMessage).toHaveBeenCalledWith('user-1', 'org-1');
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[onboarding] Created onboarding conversation',
      { conversationId: 'new-conv-id' },
    );

    // Verify the transaction callback creates both conversation and message
    const txCallback = mockPrisma.$transaction.mock.calls[0][0] as (tx: unknown) => Promise<unknown>;
    const mockTx = {
      conversation: { create: vi.fn().mockResolvedValue(createdConv) },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    await txCallback(mockTx);

    expect(mockTx.conversation.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', title: 'Getting Started' },
    });
    expect(mockTx.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'new-conv-id',
        role: MessageRole.assistant,
        content: 'Hey Alice! Welcome to Service Planner.',
      },
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockAuth.mockResolvedValue({
      user: { agentUserId: 'user-1', orgId: 'org-1' },
    });
    mockGetExistingOnboardingConversation.mockRejectedValue(new Error('DB down'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Something went wrong. Please try again.' });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
