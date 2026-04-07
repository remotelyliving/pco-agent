'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Memory {
  id: string;
  key: string;
  value: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export function MemoryList({ isAdmin }: { isAdmin: boolean }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadMemories() {
    const res = await fetch('/api/memory');
    const data = await res.json();
    setMemories(data.memories ?? []);
  }

  useEffect(() => {
    loadMemories();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
      });
      setNewKey('');
      setNewValue('');
      setShowForm(false);
      await loadMemories();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    await loadMemories();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Memory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Facts the assistant has learned about your church.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add Fact'}
          </Button>
        )}
      </div>

      {showForm && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a fact</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="mem-key">Key</Label>
                <Input
                  id="mem-key"
                  placeholder="e.g. pastor_name"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mem-value">Value</Label>
                <Input
                  id="mem-value"
                  placeholder="e.g. John Smith"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Fact'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization Facts</CardTitle>
        </CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <p className="text-sm text-gray-400">
              No facts yet. The assistant will learn facts automatically during conversations.
            </p>
          ) : (
            <div className="space-y-2">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium font-mono">{memory.key}</span>
                      <Badge
                        variant={memory.source === 'manual' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {memory.source}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 truncate">{memory.value}</p>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(memory.id)}
                      className="text-red-500 hover:text-red-700 shrink-0"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
