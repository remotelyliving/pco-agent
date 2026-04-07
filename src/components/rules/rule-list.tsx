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
  const [rules, setRules] = useState<Rule[]>([]);
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
    await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
    loadRules();
  }

  function isEnabled(rule: Rule): boolean {
    const override = settings[rule.id];
    // System + org rules: enabled by default unless opted out
    if (rule.ruleType === 'system' || rule.ruleType === 'org') {
      return override !== false;
    }
    // User's own rules: always enabled
    if (rule.createdById === userId) return true;
    // Other users' public rules: disabled unless opted in
    return override === true;
  }

  const systemRules = rules.filter((r) => r.ruleType === 'system');
  const orgRules = rules.filter((r) => r.ruleType === 'org');
  const userRules = rules.filter((r) => r.ruleType === 'user');

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

      <RuleSection
        title="System Defaults"
        rules={systemRules}
        isEnabled={isEnabled}
        onToggle={handleToggle}
        onDelete={handleDelete}
        canDelete={false}
        userId={userId}
      />
      <RuleSection
        title="Organization Rules"
        rules={orgRules}
        isEnabled={isEnabled}
        onToggle={handleToggle}
        onDelete={handleDelete}
        canDelete={isAdmin}
        userId={userId}
      />
      {userRules.length > 0 && (
        <RuleSection
          title="Personal Rules"
          rules={userRules}
          isEnabled={isEnabled}
          onToggle={handleToggle}
          onDelete={handleDelete}
          canDelete={true}
          userId={userId}
        />
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
  canDelete,
  userId,
}: {
  title: string;
  rules: Rule[];
  isEnabled: (rule: Rule) => boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  userId: string;
}) {
  if (rules.length === 0) return null;

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
              aria-label={`Toggle rule: ${rule.content.slice(0, 50)}`}
            />
            <div className="flex-1">
              <p className="text-sm">{rule.content}</p>
              {rule.category && (
                <Badge variant="secondary" className="mt-1">
                  {rule.category}
                </Badge>
              )}
            </div>
            {(canDelete || rule.createdById === userId) && rule.ruleType !== 'system' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(rule.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
