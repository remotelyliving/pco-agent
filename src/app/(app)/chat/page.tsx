import type { Metadata } from 'next';
import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { needsSetup } from '@/lib/setup';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Chat — Service Planner',
};

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  if (await needsSetup(session.user.agentUserId)) {
    redirect('/setup');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: { onboardingComplete: true },
  });

  return <ChatInterface onboardingComplete={user?.onboardingComplete ?? true} />;
}
