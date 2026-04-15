'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MODEL_OPTIONS, getDefaultModel } from '@/lib/ai/models';
import { PROVIDER_INFO, SUPPORTED_PROVIDERS, type SupportedProvider } from '@/lib/ai/provider-meta';

interface WizardProviderExtra {
  highlight: string;
  costEstimate: string;
  freeTier: string | null;
  keyPrefix: string;
  signupUrl: string;
  steps: string[];
  description: string;
}

const WIZARD_EXTRA: Record<SupportedProvider, WizardProviderExtra> = {
  anthropic: {
    description: 'Claude excels at understanding context, following nuanced instructions, and explaining things clearly. A great choice for church staff who need thoughtful, detailed answers.',
    highlight: 'Best at understanding complex questions',
    costEstimate: '~500 messages for $5',
    freeTier: null,
    keyPrefix: 'sk-ant-',
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
    description: 'GPT models are versatile and widely used. If you already use ChatGPT, this is a natural fit. Great all-around performance at competitive prices.',
    highlight: 'Versatile and widely used',
    costEstimate: '~800 messages for $5',
    freeTier: null,
    keyPrefix: 'sk-',
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
    description: 'Gemini is fast, affordable, and uniquely offers a free tier — no credit card needed. Perfect for trying things out or keeping costs minimal.',
    highlight: 'Free tier available — no credit card needed',
    costEstimate: '~2,500 messages for $5 (or free within daily limits)',
    freeTier: 'Up to 250 requests/day free with any Google account',
    keyPrefix: '',
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

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiProvider: provider, apiKey, modelId: selectedModel }),
      });
      if (res.ok) {
        setTestResult('success');
      } else {
        const data = await res.json();
        setTestResult('error');
        setError(data.error || 'Connection test failed. Check your API key.');
      }
    } catch (err) {
      setTestResult('error');
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiProvider: provider, apiKey, preferredModel: selectedModel }),
      });
      if (!res.ok) throw new Error(await res.text());
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
            className={`h-2 w-16 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`}
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
            <div className="rounded-lg bg-primary/10 p-4 text-sm text-primary">
              <p className="font-medium">How does this work?</p>
              <p className="mt-1">
                Service Planner connects to an AI service (like ChatGPT or Claude) to understand your questions,
                then uses your Planning Center data to answer them. You choose which AI provider to use
                and provide your own API key — a secure credential that lets our app communicate with the AI
                on your behalf.
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm text-foreground">
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
              const extra = WIZARD_EXTRA[p];
              return (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setModel(''); setStep(3); }}
                  className={`w-full rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/60 ${
                    provider === p ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <p className="font-semibold">{info.name}</p>
                    {extra.freeTier && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                        Free tier
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{extra.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Estimated cost: {extra.costEstimate} (as of April 2026)
                  </p>
                </button>
              );
            })}
            <p className="text-center text-xs text-muted-foreground pt-2">
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
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
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
                className={`w-full rounded-lg border-2 p-3 text-left transition-colors hover:border-primary/60 ${
                  (model === m.id || (!model && m.isDefault)) ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{m.name}</p>
                  {m.isDefault && (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                      Recommended
                    </span>
                  )}
                  {m.supportsTools === false && (
                    <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                      Chat only
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{m.description}</p>
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
            <CardTitle>Enter Your {PROVIDER_INFO[provider as SupportedProvider].name} API Key</CardTitle>
            <CardDescription>
              An API key is like a password that lets Service Planner talk to {PROVIDER_INFO[provider as SupportedProvider].name} on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-foreground mb-2">How to get your key:</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                {WIZARD_EXTRA[provider as SupportedProvider].steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <a
                href={PROVIDER_INFO[provider as SupportedProvider].keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-primary hover:text-primary/80"
              >
                Open {PROVIDER_INFO[provider as SupportedProvider].name} dashboard &rarr;
              </a>
            </div>

            <div className="space-y-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); setError(''); }}
                placeholder={WIZARD_EXTRA[provider as SupportedProvider].keyPrefix ? `Paste your key (starts with "${WIZARD_EXTRA[provider as SupportedProvider].keyPrefix}")` : 'Paste your API key here'}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
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
                  onClick={handleTest}
                  disabled={!apiKey || testing}
                  className="flex-1"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!apiKey || saving}
                className="flex-1"
                size="lg"
              >
                {saving ? 'Saving...' : testResult === 'success' ? 'Save & Start Chatting' : 'Save & Continue'}
              </Button>
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
            <p className="text-center text-xs text-muted-foreground">
              You can change your provider or model anytime in Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
