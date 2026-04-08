import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import { createModel } from '@/lib/ai/providers';
import { getDefaultModel } from '@/lib/ai/models';
import { generateText } from 'ai';

export async function POST() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
  });

  if (!user?.apiProvider || !user?.apiKeyEnc) {
    return Response.json({ success: false, error: 'No API key configured' }, { status: 400 });
  }

  try {
    const apiKey = decrypt(user.apiKeyEnc, getEncryptionKey());
    const modelId = user.preferredModel || getDefaultModel(user.apiProvider)?.id || 'claude-sonnet-4-5-20250514';
    const model = createModel(user.apiProvider, modelId, apiKey);

    // Make a minimal API call
    const { text } = await generateText({
      model,
      prompt: 'Say "connected" and nothing else.',
      providerOptions: { anthropic: { maxTokens: 10 }, openai: { maxTokens: 10 }, google: { maxOutputTokens: 10 } },
    });

    return Response.json({ success: true, provider: user.apiProvider, response: text.trim() });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }, { status: 400 });
  }
}
