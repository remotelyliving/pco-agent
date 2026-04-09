import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';
import { auth, signOut } from '@/lib/auth';
import { listConversations } from '@/lib/chat/persist';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  const { conversations } = await listConversations(session?.user?.agentUserId || '');
  const mobileConversations = conversations.slice(0, 10).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-blue-600 focus:underline">
        Skip to content
      </a>
      <MobileNav userName={session?.user?.name} userRole={session?.user?.role} onSignOut={handleSignOut} conversations={mobileConversations} />
      <Sidebar />
      <main id="main" className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
