'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function ConversationItem({ id, title }: { id: string; title: string | null }) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="group flex items-center rounded-md hover:bg-gray-200">
      <Link
        href={`/chat/${id}`}
        className="flex-1 truncate px-2 py-1.5 text-sm text-gray-700"
      >
        {title || 'Untitled conversation'}
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
