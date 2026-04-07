'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

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

export function ConversationItem({ id, title, updatedAt }: { id: string; title: string | null; updatedAt: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === `/chat/${id}`;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className={`group flex items-center rounded-md ${isActive ? 'bg-gray-200' : 'hover:bg-gray-100'}`}>
      <Link
        href={`/chat/${id}`}
        className="flex-1 truncate px-2 py-1.5"
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="block truncate text-sm text-gray-700">{title || 'Untitled conversation'}</span>
        <span className="text-xs text-gray-400">{timeAgo(updatedAt)}</span>
      </Link>
      <button
        onClick={handleDelete}
        className="hidden group-hover:block px-2 text-xs text-gray-400 hover:text-red-500"
        aria-label="Delete conversation"
      >
        ✕
      </button>
    </div>
  );
}
