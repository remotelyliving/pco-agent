import type { Metadata } from 'next';
import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { needsSetup } from '@/lib/setup';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Chat — Planning Center Assistant',
};

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  if (await needsSetup(session.user.agentUserId)) {
    redirect('/setup');
  }

  return <ChatInterface />;
}
