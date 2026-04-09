'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MODEL_OPTIONS, getDefaultModel } from '@/lib/ai/models';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';

interface ProviderInfo {
  name: string;
  description: string;
  highlight: string;
  costEstimate: string;
  freeTier: string | null;
  keyPrefix: string;
  keyUrl: string;
  signupUrl: string;
  steps: string[];
}

const PROVIDER_INFO: Record<string, ProviderInfo> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    description: 'Claude excels at understanding context, following nuanced instructions, and explaining things clearly. A great choice for church staff who need thoughtful, detailed answers.',
    highlight: 'Best at understanding complex questions',
    costEstimate: '~500 messages for $5',
    freeTier: null,
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    signupUrl: 'https://console.anthropic.com',
    steps: [
      'Go to console.anthropic.com and create an account (or sign in)',
      'Add a payment method (credit card) under Billing',
      'Click "API Keys" in the left sidebar',
      'Click "Create Key", name it "Service Planner"',
      'Copy the key — it starts with "sk-ant-"',
    ],
  },
  openai: {
    name: 'OpenAI (ChatGPT)',
    description: 'GPT models are versatile and widely used. If you already use ChatGPT, this is a natural fit. Great all-around performance at competitive prices.',
    highlight: 'Versatile and widely used',
    costEstimate: '~800 messages for $5',
    freeTier: null,
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    signupUrl: 'https://platform.openai.com',
    steps: [
      'Go to platform.openai.com and sign in (or create an account)',
      'Navigate to Billing and add a payment method (minimum $5 prepay)',
      'Go to API Keys in the left menu',
      'Click "Create new secret key" and name it "Service Planner"',
      'Copy the key — it starts with "sk-"',
    ],
  },
  google: {
    name: 'Google (Gemini)',
    description: 'Gemini is fast, affordable, and uniquely offers a free tier — no credit card needed. Perfect for trying things out or keeping costs minimal.',
    highlight: 'Free tier available — no credit card needed',
    costEstimate: '~2,500 messages for $5 (or free within daily limits)',
    freeTier: 'Up to 250 requests/day free with any Google account',
    keyPrefix: '',
    keyUrl: 'https://aistudio.google.com/apikey',
    signupUrl: 'https://aistudio.google.com',
    steps: [
      'Go to aistudio.google.com and sign in with any Google account',
      'Click "Get API key" in the left sidebar',
      'Click "Create API key in new project"',
      'Copy the generated key — you can start using it immediately',
      '(Optional) Add billing later for higher rate limits',
    ],
  },
};

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState('');

  const providerModels = MODEL_OPTIONS.filter((m) => m.provider === provider);
  const selectedModel = model || getDefaultModel(provider)?.id || '';

  async function saveSettings(): Promise<boolean> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiProvider: provider, apiKey, preferredModel: selectedModel }),
    });
    return res.ok;
  }

  async function clearSettings(): Promise<void> {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiProvider: provider, apiKey: '' }),
    });
  }

  async function handleSaveAndTest() {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      // Save first (test endpoint reads from DB)
      if (!await saveSettings()) throw new Error('Failed to save settings');

      const testRes = await fetch('/api/settings/test', { method: 'POST' });
      if (testRes.ok) {
        setTestResult('success');
      } else {
        // Test failed — clear the bad key so needsSetup still gates chat
        await clearSettings();
        const data = await testRes.json();
        setTestResult('error');
        setError(data.error || 'Connection test failed. Check your API key.');
      }
    } catch (err) {
      // On error, try to clear the potentially bad key
      await clearSettings().catch(() => {});
      setTestResult('error');
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveWithoutTest() {
    setSaving(true);
    setError('');
    try {
      if (!await saveSettings()) throw new Error('Failed to save settings');
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = 5;

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress */}
      <div className="mb-8 flex justify-center gap-2" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={totalSteps} aria-label={`Step ${step} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to Service Planner!</CardTitle>
            <CardDescription className="text-base">
              Chat with an AI that knows your church data — ask about people, services, schedules, and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">How does this work?</p>
              <p className="mt-1">
                Service Planner connects to an AI service (like ChatGPT or Claude) to understand your questions,
                then uses your Planning Center data to answer them. You choose which AI provider to use
                and provide your own API key — a secure credential that lets our app communicate with the AI
                on your behalf.
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-medium">Is my data safe?</p>
              <p className="mt-1">
                Your API key is encrypted before being stored. Your church data is sent to the AI provider
                you choose only when you ask a question, and only the data needed to answer it.
              </p>
            </div>
            <Button onClick={() => setStep(2)} className="w-full" size="lg">
              Choose an AI Provider
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Provider selection */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Your AI Provider</CardTitle>
            <CardDescription>
              All three providers work great with Service Planner. Pick whichever you prefer
              or already have an account with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {SUPPORTED_PROVIDERS.map((p) => {
              const info = PROVIDER_INFO[p];
              return (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setModel(''); setStep(3); }}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors hover:border-blue-500 ${
                    provider === p ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <p className="font-semibold">{info.name}</p>
                    {info.freeTier && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Free tier
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{info.description}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Estimated cost: {info.costEstimate} (as of April 2026)
                  </p>
                </button>
              );
            })}
            <p className="text-center text-xs text-gray-400 pt-2">
              You can switch providers later in Settings.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Model selection */}
      {step === 3 && provider && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a Model</CardTitle>
            <CardDescription>
              Models vary in capability and cost. The recommended default works well for most church tasks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              <p className="font-medium">Why does this matter?</p>
              <p className="mt-1">
                More capable models give better answers for complex questions but cost more per message.
                For everyday tasks like looking up people or checking schedules, even the most affordable model works great.
              </p>
            </div>
            {providerModels.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full rounded-lg border-2 p-3 text-left transition-colors hover:border-blue-500 ${
                  (model === m.id || (!model && m.isDefault)) ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{m.name}</p>
                  {m.isDefault && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{m.description}</p>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1" size="lg">
                Next: Get Your API Key
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: API Key */}
      {step === 4 && provider && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Your {PROVIDER_INFO[provider].name} API Key</CardTitle>
            <CardDescription>
              An API key is like a password that lets Service Planner talk to {PROVIDER_INFO[provider].name} on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">How to get your key:</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-600">
                {PROVIDER_INFO[provider].steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <a
                href={PROVIDER_INFO[provider].keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Open {PROVIDER_INFO[provider].name} dashboard &rarr;
              </a>
            </div>

            <div className="space-y-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); setError(''); }}
                placeholder={PROVIDER_INFO[provider].keyPrefix ? `Paste your key (starts with "${PROVIDER_INFO[provider].keyPrefix}")` : 'Paste your API key here'}
                className="text-base"
              />
              <p className="text-xs text-gray-500">
                Your key is encrypted before being saved. We never see it in plain text.
              </p>
            </div>

            {testResult === 'success' && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700" role="status">
                Connection successful! Your API key works.
              </div>
            )}

            {testResult === 'error' && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error || 'Connection test failed. Double-check your API key.'}
              </div>
            )}

            {error && !testResult && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              {testResult !== 'success' && (
                <Button
                  variant="outline"
                  onClick={handleSaveAndTest}
                  disabled={!apiKey || testing}
                  className="flex-1"
                >
                  {testing ? 'Saving & Testing...' : 'Save & Test'}
                </Button>
              )}
              {testResult === 'success' ? (
                <Button
                  onClick={handleSaveWithoutTest}
                  disabled={saving}
                  className="flex-1"
                  size="lg"
                >
                  {saving ? 'Saving...' : 'Continue'}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleSaveWithoutTest}
                  disabled={!apiKey || saving}
                  className="text-xs"
                >
                  {saving ? '...' : 'Skip test'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Success */}
      {step === 5 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
            <CardDescription className="text-base">
              Your AI provider is configured. Start chatting with your church data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => router.push('/chat')} className="w-full" size="lg">
              Start Chatting
            </Button>
            <p className="text-center text-xs text-gray-400">
              You can change your provider or model anytime in Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
