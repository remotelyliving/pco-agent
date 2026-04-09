'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

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
  onSignOut,
  conversations = [],
}: {
  userName?: string | null;
  userRole?: string;
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
          <Image src="/robot.svg" alt="" width={24} height={24} aria-hidden="true" />
          Service Planner
        </span>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md hover:bg-gray-100"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div className={`fixed inset-0 z-50 flex transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
        {open && (
          <nav className="relative z-10 w-72 bg-white h-full flex flex-col border-r shadow-lg" aria-label="Mobile navigation">
            <div className="p-4 border-b">
              <p className="flex items-center gap-2 font-semibold">
                <Image src="/robot.svg" alt="" width={24} height={24} aria-hidden="true" />
                Service Planner
              </p>
              <p className="text-sm text-gray-500">{roleLabel}</p>
            </div>
            <div className="p-4 space-y-1">
              <Link href="/chat" className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-gray-100" onClick={() => setOpen(false)}>
                + New Chat
              </Link>
              <Link href="/rules" className="block rounded-md px-3 py-2.5 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Rules
              </Link>
              <Link href="/memory" className="block rounded-md px-3 py-2.5 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Memory
              </Link>
              <Link href="/settings" className="block rounded-md px-3 py-2.5 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Settings
              </Link>
            </div>

            {conversations.length > 0 && (
              <>
                <div className="border-t mx-4" />
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
                          className={`block rounded-md px-3 py-2.5 ${isActive ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="block truncate text-sm text-gray-700">
                            {conv.title || 'Untitled conversation'}
                          </span>
                          <span className="text-xs text-gray-400">{timeAgo(conv.updatedAt)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="p-4 border-t mt-auto">
              <p className="text-sm font-medium truncate">{userName || 'User'}</p>
              {onSignOut && (
                <form action={onSignOut} className="mt-2">
                  <Button variant="outline" size="sm" type="submit" className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
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
