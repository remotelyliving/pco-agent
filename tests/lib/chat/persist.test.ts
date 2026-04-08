import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  conversation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  message: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  createConversation,
  getConversation,
  listConversations,
  saveMessage,
  getMessages,
  updateConversationTitle,
} from '@/lib/chat/persist';

describe('chat persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createConversation calls prisma with userId', async () => {
    mockPrisma.conversation.create.mockResolvedValue({
      id: 'conv-1', userId: 'user-1', title: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await createConversation('user-1');
    expect(result.id).toBe('conv-1');
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
  });

  it('getConversation returns conversation with messages', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1', messages: [{ id: 'msg-1', role: 'user', content: 'hello' }],
    });
    const result = await getConversation('conv-1', 'user-1');
    expect(result).toBeDefined();
    expect(mockPrisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
  });

  it('listConversations returns user conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1', title: 'Test' }]);
    const result = await listConversations('user-1');
    expect(result.conversations).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      take: 51,
    });
  });

  it('saveMessage creates a message record', async () => {
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'hello' });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });
    const result = await saveMessage({ conversationId: 'conv-1', role: 'user', content: 'hello' });
    expect(result.id).toBe('msg-1');
  });

  it('saveMessage touches the conversation updatedAt', async () => {
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'hello' });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });
    await saveMessage({ conversationId: 'conv-1', role: 'user', content: 'hello' });
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('saveMessage stores toolCalls as JSON', async () => {
    const toolCalls = [{ name: 'search', args: { q: 'test' } }];
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-2', toolCalls });
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1' });
    await saveMessage({ conversationId: 'conv-1', role: 'assistant', content: 'result', toolCalls });
    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toolCalls }),
    });
  });

  it('getMessages returns ordered messages', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'hi' },
      { id: 'msg-2', role: 'assistant', content: 'hello' },
    ]);
    const result = await getMessages('conv-1');
    expect(result).toHaveLength(2);
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('getMessages supports take and cursor params', async () => {
    mockPrisma.message.findMany.mockResolvedValue([{ id: 'msg-5', role: 'user', content: 'hi' }]);
    await getMessages('conv-1', { take: 20, cursor: 'msg-4' });
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      skip: 1,
      cursor: { id: 'msg-4' },
    });
  });

  it('listConversations returns hasMore=true when over limit', async () => {
    const convos = Array.from({ length: 51 }, (_, i) => ({ id: `conv-${i}`, title: `Conv ${i}` }));
    mockPrisma.conversation.findMany.mockResolvedValue(convos);
    const result = await listConversations('user-1');
    expect(result.conversations).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('updateConversationTitle updates the title', async () => {
    mockPrisma.conversation.update.mockResolvedValue({ id: 'conv-1', title: 'New Title' });
    await updateConversationTitle('conv-1', 'New Title');
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { title: 'New Title' },
    });
  });
});
