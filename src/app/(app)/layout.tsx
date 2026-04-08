import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';
import { auth, signOut } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <MobileNav userName={session?.user?.name} userRole={session?.user?.role} onSignOut={handleSignOut} />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
