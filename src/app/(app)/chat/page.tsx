import { ChatInterface } from '@/components/chat/chat-interface';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');
  return <ChatInterface />;
}
