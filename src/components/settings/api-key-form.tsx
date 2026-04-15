'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODEL_OPTIONS } from '@/lib/ai/models';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';
import { getProviderDisplayName } from '@/lib/ai/provider-meta';

export function ApiKeyForm() {
  const [provider, setProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.apiProvider) setProvider(data.apiProvider);
        if (data.preferredModel) setModel(data.preferredModel);
        setHasExistingKey(data.hasApiKey);
      });
  }, []);

  const modelsForProvider = MODEL_OPTIONS.filter((m) => m.provider === provider);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', { method: 'POST' });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.success ? `Connected to ${data.provider}!` : data.error,
      });
    } catch {
      setTestResult({ success: false, message: 'Failed to test connection' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiProvider: provider,
          apiKey: apiKey || undefined,
          preferredModel: model || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ type: 'success', text: 'Settings saved!' });
      setApiKey('');
      setHasExistingKey(true);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Settings</CardTitle>
        <CardDescription>
          Choose your AI provider and enter your API key. Your key is encrypted
          and stored securely — we never see it in plain text.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select value={provider} onValueChange={(v) => { if (v) { setProvider(v); setModel(''); } }}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select a provider..." />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {getProviderDisplayName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider && (
            <div className="space-y-2">
              <Label>Model</Label>
              <div className="space-y-2">
                {modelsForProvider.map((m) => {
                  const isSelected = model ? model === m.id : !!m.isDefault;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={`w-full rounded-lg border-2 p-3 text-left transition-colors hover:border-primary/60 ${
                        isSelected ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          isSelected ? 'border-primary bg-primary ring-2 ring-white ring-inset' : 'border-border'
                        }`} />
                        <span className="font-medium text-sm">{m.name}</span>
                        {m.isDefault && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Recommended
                          </span>
                        )}
                        {m.supportsTools === false && (
                          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                            Chat only
                          </span>
                        )}
                      </div>
                      <p className="mt-1 ml-6 text-sm text-muted-foreground">{m.description}</p>
                      {m.supportsTools === false && (
                        <p className="mt-0.5 ml-6 text-xs text-warning-foreground">No Planning Center access — conversation only</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API Key {hasExistingKey && '(leave blank to keep current key)'}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKey ? '••••••••' : 'Paste your API key here'}
              required={!hasExistingKey}
            />
            <p className="text-xs text-muted-foreground">
              {provider === 'anthropic' && 'Get your key at console.anthropic.com'}
              {provider === 'openai' && 'Get your key at platform.openai.com'}
              {provider === 'google' && 'Get your key at aistudio.google.com'}
            </p>
          </div>

          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'}`} role="alert">
              {message.text}
            </div>
          )}

          <Button type="submit" disabled={saving || !provider}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>

          {hasExistingKey && (
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          )}

          {testResult && (
            <div className={`rounded-lg p-3 text-sm ${testResult.success ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'}`} role="alert">
              {testResult.message}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
