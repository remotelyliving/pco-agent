import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import { createModel, SUPPORTED_PROVIDERS } from '@/lib/ai/providers';
import { getDefaultModel } from '@/lib/ai/models';
import { generateText } from 'ai';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let apiProvider: string;
  let apiKey: string;
  let modelId: string;

  // Accept provider + key in body (wizard flow) or read from DB (settings page flow)
  try {
    const body = await req.json();
    if (body.apiProvider && body.apiKey) {
      if (!SUPPORTED_PROVIDERS.includes(body.apiProvider)) {
        return Response.json({ success: false, error: `Unsupported provider: ${body.apiProvider}` }, { status: 400 });
      }
      apiProvider = body.apiProvider;
      apiKey = body.apiKey;
      modelId = body.modelId || getDefaultModel(apiProvider)?.id || 'claude-sonnet-4-6';
    } else {
      throw new Error('fallback to DB');
    }
  } catch {
    // No body or incomplete body — read from DB (existing settings page behavior)
    const user = await prisma.user.findUnique({
      where: { id: session.user.agentUserId },
    });

    if (!user?.apiProvider || !user?.apiKeyEnc) {
      return Response.json({ success: false, error: 'No API key configured' }, { status: 400 });
    }

    apiProvider = user.apiProvider;
    apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
    modelId = user.preferredModel || getDefaultModel(apiProvider)?.id || 'claude-sonnet-4-6';
  }

  try {
    const model = createModel(apiProvider, modelId, apiKey);

    const { text } = await generateText({
      model,
      prompt: 'Say "connected" and nothing else.',
      providerOptions: { anthropic: { maxTokens: 10 }, openai: { maxTokens: 10 }, google: { maxOutputTokens: 10 } },
    });

    return Response.json({ success: true, provider: apiProvider, response: text.trim() });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }, { status: 400 });
  }
}
