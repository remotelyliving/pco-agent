import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { getConversation } from '@/lib/chat/persist';
import { needsSetup } from '@/lib/setup';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  if (await needsSetup(session.user.agentUserId)) {
    redirect('/setup');
  }

  const { id } = await params;
  const [conversation, user] = await Promise.all([
    getConversation(id, session.user.agentUserId),
    prisma.user.findUnique({
      where: { id: session.user.agentUserId },
      select: { onboardingComplete: true },
    }),
  ]);
  if (!conversation) notFound();

  const initialMessages = conversation.messages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  return (
    <ChatInterface
      conversationId={conversation.id}
      initialMessages={initialMessages}
      onboardingComplete={user?.onboardingComplete ?? true}
    />
  );
}
