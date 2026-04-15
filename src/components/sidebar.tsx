import { auth, signOut } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { listConversations } from '@/lib/chat/persist';
import { prisma } from '@/lib/db';
import { ConversationItem } from '@/components/conversation-item';
import { BookOpen, Brain, Settings } from 'lucide-react';

export async function Sidebar() {
  const session = await auth();
  const user = session?.user;

  const org = user?.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { name: true } })
    : null;
  const orgName = org?.name && org.name !== 'Unknown' ? org.name : null;
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
    <nav className="hidden md:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar" aria-label="Main navigation">
      <header className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">SP</div>
          <h2 className="text-lg font-semibold">Service Planner</h2>
        </div>
        {orgName && <p className="text-sm font-medium text-sidebar-foreground/80">{orgName}</p>}
        <p className="text-sm text-muted-foreground">
          {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Editor' : 'Member'}
        </p>
      </header>

      <Separator />

      <div className="space-y-2 p-4">
        <Link
          href="/chat"
          className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
        >
          + New Chat
        </Link>
        <Link
          href="/rules"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          Rules
        </Link>
        <Link
          href="/memory"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <Brain className="h-4 w-4 text-muted-foreground" />
          Memory
        </Link>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start gap-2')}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Settings
        </Link>
      </div>

      <div className="px-4 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">Recent</p>
      </div>

      <ScrollArea className="flex-1 px-4">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet</p>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <ConversationItem key={conv.id} id={conv.id} title={conv.title} updatedAt={conv.updatedAt.toISOString()} />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          <p className="flex-1 text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
          <ThemeToggle />
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <Button variant="outline" size="sm" type="submit" className="w-full text-muted-foreground">
            Sign out
          </Button>
        </form>
      </div>
    </nav>
  );
}
