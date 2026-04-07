'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function MobileNav({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Planning Center Assistant</span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
          {open ? '✕' : '☰'}
        </Button>
      </div>

      {/* Overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <nav className="relative z-10 w-64 bg-white h-full flex flex-col border-r shadow-lg" aria-label="Mobile navigation">
            <div className="p-4 border-b">
              <p className="font-semibold">Planning Center Assistant</p>
              <p className="text-sm text-gray-500">{userRole === 'admin' ? 'Admin' : 'Member'}</p>
            </div>
            <div className="flex-1 p-4 space-y-2">
              <Link href="/chat" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                + New Chat
              </Link>
              <Link href="/rules" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Rules
              </Link>
              <Link href="/memory" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Memory
              </Link>
              <Link href="/settings" className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100" onClick={() => setOpen(false)}>
                Settings
              </Link>
            </div>
            <div className="p-4 border-t">
              <p className="text-sm font-medium">{userName || 'User'}</p>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
