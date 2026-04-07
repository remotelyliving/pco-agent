'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

const PROVIDER_INFO: Record<string, { name: string; description: string; keyUrl: string; steps: string[] }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Claude is great at understanding context, following instructions, and explaining things clearly.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Go to console.anthropic.com and sign in (or create an account)',
      'Click "API Keys" in the left sidebar',
      'Click "Create Key" and give it a name like "PCO Assistant"',
      'Copy the key — it starts with "sk-ant-"',
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    description: 'GPT models are versatile and widely used. Great all-around performance.',
    keyUrl: 'https://platform.openai.com/api-keys',
    steps: [
      'Go to platform.openai.com and sign in',
      'Click your profile icon, then "API keys"',
      'Click "Create new secret key"',
      'Copy the key — it starts with "sk-"',
    ],
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Gemini models are fast and affordable. Good for everyday tasks.',
    keyUrl: 'https://aistudio.google.com/apikey',
    steps: [
      'Go to aistudio.google.com',
      'Click "Get API key" in the top menu',
      'Click "Create API key"',
      'Copy the key',
    ],
  },
};

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiProvider: provider, apiKey }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress */}
      <div className="mb-8 flex justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to Planning Center Assistant!</CardTitle>
            <CardDescription className="text-base">
              This app lets you chat with an AI that knows your church data.
              Ask about people, services, schedules — anything in Planning Center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              To get started, you will need an AI provider API key. This is like a password
              that lets our app talk to an AI service on your behalf. Your key is encrypted
              and stored securely.
            </p>
            <Button onClick={() => setStep(2)} className="w-full" size="lg">
              Let&apos;s Get Started
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Your AI Provider</CardTitle>
            <CardDescription>
              Pick which AI service you would like to use. All three work great — choose
              whichever you prefer or already have an account with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {SUPPORTED_PROVIDERS.map((p) => {
              const info = PROVIDER_INFO[p];
              return (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setStep(3); }}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors hover:border-blue-500 ${
                    provider === p ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <p className="font-semibold">{info.name}</p>
                  <p className="text-sm text-gray-600">{info.description}</p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {step === 3 && provider && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Your {PROVIDER_INFO[provider].name} API Key</CardTitle>
            <CardDescription>
              Follow these steps to get your API key:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
              {PROVIDER_INFO[provider].steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>

            <a
              href={PROVIDER_INFO[provider].keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-blue-600 underline"
            >
              Open {PROVIDER_INFO[provider].name} in a new tab
            </a>

            <div className="space-y-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here"
                className="text-lg"
              />
              <p className="text-xs text-gray-500">
                Your key is encrypted before being saved. We can never see it in plain text.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!apiKey || saving}
                className="flex-1"
                size="lg"
              >
                {saving ? 'Saving...' : 'Save & Continue'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">
              Your AI provider is configured. You can now start chatting with your
              Planning Center data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/chat')} className="w-full" size="lg">
              Start Chatting
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
