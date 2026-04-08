import type { Metadata } from 'next';
import { RuleList } from '@/components/rules/rule-list';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Rules — Planning Center Assistant',
};

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  const canManage = session.user.role === 'admin' || session.user.role === 'editor';

  return (
    <div className="mx-auto max-w-2xl p-6">
      <RuleList
        isAdmin={canManage}
        userId={session.user.agentUserId}
      />
    </div>
  );
}
