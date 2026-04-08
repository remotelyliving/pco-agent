import { auth, signOut } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { listConversations } from '@/lib/chat/persist';
import { ConversationItem } from '@/components/conversation-item';

export async function Sidebar() {
  const session = await auth();
  const user = session?.user;
  const initials =
    user?.name
      ?.split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const { conversations } = await listConversations(session?.user?.agentUserId || '');

  return (
    <nav className="hidden md:flex h-full w-64 flex-col border-r bg-gray-50" aria-label="Main navigation">
      <header className="p-4">
        <h2 className="text-lg font-semibold">Planning Center Assistant</h2>
        <p className="text-sm text-gray-500">
          {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Editor' : 'Member'}
        </p>
      </header>

      <Separator />

      <div className="space-y-2 p-4">
        <Link
          href="/chat"
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
        >
          + New Chat
        </Link>
        <Link
          href="/rules"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
        >
          Rules
        </Link>
        <Link
          href="/memory"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
        >
          Memory
        </Link>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
        >
          Settings
        </Link>
      </div>

      <ScrollArea className="flex-1 px-4">
        {conversations.length === 0 ? (
          <p className="text-sm text-gray-400">No conversations yet</p>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <ConversationItem key={conv.id} id={conv.id} title={conv.title} updatedAt={conv.updatedAt.toISOString()} />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </nav>
  );
}
