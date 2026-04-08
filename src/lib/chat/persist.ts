import { MessageRole } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function createConversation(userId: string) {
  return prisma.conversation.create({ data: { userId } });
}

export async function getConversation(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 100 } },
  });
  if (conv) {
    conv.messages.reverse();
  }
  return conv;
}

export async function listConversations(userId: string) {
  const results = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 51,
  });
  const hasMore = results.length > 50;
  return {
    conversations: hasMore ? results.slice(0, 50) : results,
    hasMore,
  };
}

export async function saveMessage(data: {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: unknown;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ?? undefined,
    },
  });

  // Touch conversation to update updatedAt for sidebar sorting
  await prisma.conversation.update({
    where: { id: data.conversationId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function getMessages(
  conversationId: string,
  options?: { take?: number; cursor?: string },
) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    ...(options?.take ? { take: options.take } : {}),
    ...(options?.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });
}

export async function updateConversationTitle(conversationId: string, title: string) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { title },
  });
}
