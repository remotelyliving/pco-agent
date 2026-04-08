import type { Metadata } from 'next';
import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { needsSetup } from '@/lib/setup';
import { logger } from '@/lib/logger';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Chat — Planning Center Assistant',
};

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  try {
    if (await needsSetup(session.user.agentUserId)) {
      redirect('/setup');
    }
  } catch (error) {
    logger.error('[chat] Setup check failed', { error: error instanceof Error ? error.message : String(error) });
    // Continue to chat — better than breaking the page
  }

  return <ChatInterface />;
}
