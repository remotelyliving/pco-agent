import type { Metadata } from 'next';
import { MemoryList } from '@/components/memory/memory-list';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Memory — Planning Center Assistant',
};

export default async function MemoryPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl p-6">
      <MemoryList isAdmin={session.user.role === 'admin'} />
    </div>
  );
}
