'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Menu, X, BookOpen, Brain, Settings } from 'lucide-react';

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

interface MobileConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

export function MobileNav({
  userName,
  userRole,
  orgName,
  onSignOut,
  conversations = [],
}: {
  userName?: string | null;
  userRole?: string;
  orgName?: string | null;
  onSignOut?: () => Promise<void>;
  conversations?: MobileConversation[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const roleLabel = userRole === 'admin' ? 'Admin' : userRole === 'editor' ? 'Editor' : 'Member';

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">SP</div>
          Service Planner
        </span>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md hover:bg-muted"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div className={`fixed inset-0 z-50 flex transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
        {open && (
          <nav className="relative z-10 w-72 bg-background h-full flex flex-col border-r border-sidebar-border shadow-lg" aria-label="Mobile navigation">
            <div className="p-4 border-b border-sidebar-border">
              <p className="flex items-center gap-2 font-semibold">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">SP</div>
                Service Planner
              </p>
              {orgName && <p className="text-sm font-medium text-sidebar-foreground">{orgName}</p>}
              <p className="text-sm text-muted-foreground">{roleLabel}</p>
            </div>
            <div className="p-4 space-y-1">
              <Link href="/chat" className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted" onClick={() => setOpen(false)}>
                + New Chat
              </Link>
              <Link href="/rules" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                <BookOpen className="h-4 w-4 shrink-0" />
                Rules
              </Link>
              <Link href="/memory" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                <Brain className="h-4 w-4 shrink-0" />
                Memory
              </Link>
              <Link href="/settings" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                <Settings className="h-4 w-4 shrink-0" />
                Settings
              </Link>
            </div>

            {conversations.length > 0 && (
              <>
                <div className="border-t border-sidebar-border mx-4" />
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recent Chats
                  </p>
                  <div className="space-y-0.5">
                    {conversations.map((conv) => {
                      const isActive = pathname === `/chat/${conv.id}`;
                      return (
                        <Link
                          key={conv.id}
                          href={`/chat/${conv.id}`}
                          onClick={() => setOpen(false)}
                          className={`block rounded-md px-3 py-2.5 ${isActive ? 'bg-muted' : 'hover:bg-muted'}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="block truncate text-sm text-sidebar-foreground">
                            {conv.title || 'Untitled conversation'}
                          </span>
                          <span className="text-xs text-muted-foreground">{timeAgo(conv.updatedAt)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="p-4 border-t border-sidebar-border mt-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium truncate">{userName || 'User'}</p>
                <ThemeToggle />
              </div>
              {onSignOut && (
                <form action={onSignOut}>
                  <Button variant="outline" size="sm" type="submit" className="w-full text-muted-foreground">
                    Sign out
                  </Button>
                </form>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
