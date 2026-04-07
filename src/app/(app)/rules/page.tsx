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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <RuleList
        isAdmin={session.user.role === 'admin'}
        userId={session.user.agentUserId}
      />
    </div>
  );
}
