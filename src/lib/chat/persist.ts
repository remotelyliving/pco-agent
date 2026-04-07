import { prisma } from '@/lib/db';

export async function createConversation(userId: string) {
  return prisma.conversation.create({ data: { userId } });
}

export async function getConversation(conversationId: string, userId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
}

export async function saveMessage(data: {
  conversationId: string;
  role: string;
  content: string;
  toolCalls?: unknown;
}) {
  return prisma.message.create({
    data: {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ?? undefined,
    },
  });
}

export async function getMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateConversationTitle(conversationId: string, title: string) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { title },
  });
}
