import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ApiKeyForm } from '@/components/settings/api-key-form';

export const metadata: Metadata = {
  title: 'Settings — Planning Center Assistant',
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.agentUserId) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <ApiKeyForm />
    </div>
  );
}
