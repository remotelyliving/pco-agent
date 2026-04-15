'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pencil, X } from 'lucide-react';

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

// Visible on touch (always), hidden on desktop until hover — 48px targets for accessibility
const ACTION_BTN_CLASSES = 'min-h-[48px] min-w-[48px] flex items-center justify-center text-muted-foreground shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100';

export function ConversationItem({ id, title, updatedAt }: { id: string; title: string | null; updatedAt: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isActive = pathname === `/chat/${id}`;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function handleDelete() {
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    if (pathname === `/chat/${id}`) {
      router.push('/chat');
    } else {
      router.refresh();
    }
  }

  async function handleRename() {
    if (savingRef.current) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === title) {
      setEditing(false);
      setError('');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError('Rename failed');
      }
    } catch {
      setError('Rename failed');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    }
    if (e.key === 'Escape') {
      setEditValue(title || '');
      setEditing(false);
      setError('');
    }
  }

  if (editing) {
    return (
      <div className={`flex flex-col rounded-md px-2 py-1.5 ${isActive ? 'bg-primary/10' : 'bg-muted'}`}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleRename}
          disabled={saving}
          maxLength={200}
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
          aria-label="Rename conversation"
        />
        {error && <span className="text-xs text-destructive mt-0.5">{error}</span>}
      </div>
    );
  }

  return (
    <div className={`group flex items-center rounded-md ${isActive ? 'bg-primary/10' : 'hover:bg-muted'}`}>
      <Link
        href={`/chat/${id}`}
        className="flex-1 truncate px-2 py-1.5"
        aria-current={isActive ? 'page' : undefined}
      >
        <span className="block truncate text-sm text-foreground">{title || 'Untitled conversation'}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(updatedAt)}</span>
      </Link>
      <button
        onClick={() => { setEditValue(title || ''); setEditing(true); setError(''); }}
        className={`${ACTION_BTN_CLASSES} hover:text-foreground`}
        aria-label="Rename conversation"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <ConfirmDialog
        trigger={
          <button className={`${ACTION_BTN_CLASSES} hover:text-destructive`} aria-label="Delete conversation">
            <X className="h-4 w-4" />
          </button>
        }
        title="Delete conversation?"
        description="This will permanently delete this conversation and all its messages."
        onConfirm={handleDelete}
      />
    </div>
  );
}
