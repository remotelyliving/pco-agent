'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setError('');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule. Please try again.');
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
            <Select value={category || '__none__'} onValueChange={(v) => setCategory(v === '__none__' || v === null ? '' : v)}>
              <SelectTrigger id="category">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="scheduling">Scheduling</SelectItem>
                <SelectItem value="people">People</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="ruleType">Scope</Label>
              <Select value={ruleType} onValueChange={(v) => { if (v) setRuleType(v); }}>
                <SelectTrigger id="ruleType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Organization (visible to all)</SelectItem>
                  <SelectItem value="user">Personal (just me)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
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
