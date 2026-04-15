'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RuleEditor } from '@/components/rules/rule-editor';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Rule {
  id: string;
  content: string;
  ruleType: string;
  category: string | null;
  visibility: string;
  createdById: string | null;
}

export function RuleList({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [showEditor, setShowEditor] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rules')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setRules(data.rules);
          setSettings(data.settings);
        }
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  function loadRules() {
    setReloadKey((k) => k + 1);
  }

  async function handleToggle(ruleId: string, enabled: boolean) {
    const prev = settings[ruleId];
    setSettings((s) => ({ ...s, [ruleId]: enabled }));
    try {
      const res = await fetch('/api/rules/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, enabled }),
      });
      if (!res.ok) {
        setSettings((s) => ({ ...s, [ruleId]: prev }));
      }
    } catch {
      setSettings((s) => ({ ...s, [ruleId]: prev }));
    }
  }

  async function handleDelete(ruleId: string) {
    await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
    loadRules();
  }

  function isEnabled(rule: Rule): boolean {
    const override = settings[rule.id];
    // System + org rules: enabled by default unless opted out
    if (rule.ruleType === 'system' || rule.ruleType === 'org') {
      return override !== false;
    }
    // User's own rules: enabled unless explicitly opted out
    if (rule.createdById === userId) return override !== false;
    // Other users' public rules: disabled unless opted in
    return override === true;
  }

  const systemRules = (rules ?? []).filter((r) => r.ruleType === 'system');
  const orgRules = (rules ?? []).filter((r) => r.ruleType === 'org');
  const userRules = (rules ?? []).filter((r) => r.ruleType === 'user');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Button onClick={() => setShowEditor(true)}>
          {isAdmin ? 'Add Rule' : 'Add Personal Rule'}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Rules tell the AI how to behave. Toggle rules on or off to customize your experience.
      </p>

      {showEditor && (
        <RuleEditor
          isAdmin={isAdmin}
          onSave={() => {
            setShowEditor(false);
            loadRules();
          }}
          onCancel={() => setShowEditor(false)}
        />
      )}

      {rules === null && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {rules !== null && (
        <>
          <RuleSection
            title="System Defaults"
            rules={systemRules}
            isEnabled={isEnabled}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onReload={loadRules}
            canDelete={false}
            userId={userId}
            isAdmin={isAdmin}
          />
          <RuleSection
            title="Organization Rules"
            rules={orgRules}
            isEnabled={isEnabled}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onReload={loadRules}
            canDelete={isAdmin}
            userId={userId}
            isAdmin={isAdmin}
          />
          {userRules.length > 0 && (
            <RuleSection
              title="Personal Rules"
              rules={userRules}
              isEnabled={isEnabled}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onReload={loadRules}
              canDelete={true}
              userId={userId}
              isAdmin={isAdmin}
            />
          )}
        </>
      )}
    </div>
  );
}

function RuleSection({
  title,
  rules,
  isEnabled,
  onToggle,
  onDelete,
  onReload,
  canDelete,
  userId,
  isAdmin,
}: {
  title: string;
  rules: Rule[];
  isEnabled: (rule: Rule) => boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
  canDelete: boolean;
  userId: string;
  isAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');

  if (rules.length === 0) return null;

  async function handleEdit(ruleId: string) {
    const res = await fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      setEditError('');
      setEditingId(null);
      onReload();
    } else {
      setEditError('Failed to save. Please try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Switch
              checked={isEnabled(rule)}
              onCheckedChange={(checked) => onToggle(rule.id, checked)}
              disabled={rule.ruleType === 'system' && !isAdmin}
              aria-label={`Toggle rule: ${rule.content.slice(0, 50)}`}
            />
            {rule.ruleType === 'system' && !isAdmin && (
              <span className="text-xs text-muted-foreground ml-1">Admin only</span>
            )}
            <div className="flex-1">
              {editingId === rule.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-md border p-2 text-sm"
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleEdit(rule.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditError(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm">{rule.content}</p>
                  {rule.category && (
                    <Badge variant="secondary" className="mt-1">
                      {rule.category}
                    </Badge>
                  )}
                </>
              )}
            </div>
            {(canDelete || rule.createdById === userId) && rule.ruleType !== 'system' && (
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(rule.id);
                    setEditContent(rule.content);
                  }}
                >
                  Edit
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive/80"
                    >
                      Delete
                    </Button>
                  }
                  title="Delete rule?"
                  description="This will permanently delete this rule."
                  onConfirm={() => onDelete(rule.id)}
                />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
