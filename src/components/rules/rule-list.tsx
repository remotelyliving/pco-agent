'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RuleEditor } from '@/components/rules/rule-editor';

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

  async function loadRules() {
    const res = await fetch('/api/rules');
    const data = await res.json();
    setRules(data.rules);
    setSettings(data.settings);
  }

  useEffect(() => {
    loadRules();
  }, []);

  async function handleToggle(ruleId: string, enabled: boolean) {
    setSettings((prev) => ({ ...prev, [ruleId]: enabled }));
    await fetch('/api/rules/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId, enabled }),
    });
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
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

      <p className="text-sm text-gray-500">
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
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
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

  if (rules.length === 0) return null;

  async function handleEdit(ruleId: string) {
    const res = await fetch(`/api/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    });
    if (res.ok) {
      setEditingId(null);
      onReload();
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
              <span className="text-xs text-gray-400 ml-1">Admin only</span>
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
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleEdit(rule.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(rule.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
