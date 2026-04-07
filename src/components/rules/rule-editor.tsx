'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RuleEditor({
  isAdmin,
  onSave,
  onCancel,
}: {
  isAdmin: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [ruleType, setRuleType] = useState(isAdmin ? 'org' : 'user');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          ruleType,
          category: category || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
    } catch {
      // Error handling — could add error state
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">Rule</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a rule in plain English, e.g., 'Always include phone numbers when listing people.'"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category (optional)</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border p-2"
            >
              <option value="">None</option>
              <option value="general">General</option>
              <option value="scheduling">Scheduling</option>
              <option value="people">People</option>
            </select>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="ruleType">Scope</Label>
              <select
                id="ruleType"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full rounded-md border p-2"
              >
                <option value="org">Organization (visible to all)</option>
                <option value="user">Personal (just me)</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !content.trim()}>
              {saving ? 'Saving...' : 'Save Rule'}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
