import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';
import { SUPPORTED_PROVIDERS } from '@/lib/ai/providers';
import { MODEL_OPTIONS } from '@/lib/ai/models';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.agentUserId },
      select: { apiProvider: true, preferredModel: true, apiKeyEnc: true },
    });

    return Response.json({
      apiProvider: user?.apiProvider || null,
      preferredModel: user?.preferredModel || null,
      hasApiKey: !!user?.apiKeyEnc,
    });
  } catch (error) {
    console.error('[settings] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { apiProvider, apiKey, preferredModel } = body as {
    apiProvider: string;
    apiKey?: string;
    preferredModel?: string;
  };

  if (!apiProvider) {
    return new Response('Provider is required', { status: 400 });
  }

  if (!SUPPORTED_PROVIDERS.includes(apiProvider as (typeof SUPPORTED_PROVIDERS)[number])) {
    return Response.json({ error: `Unsupported provider: ${apiProvider}` }, { status: 400 });
  }

  if (preferredModel) {
    const validModels = MODEL_OPTIONS.filter((m) => m.provider === apiProvider).map((m) => m.id);
    if (!validModels.includes(preferredModel)) {
      return Response.json(
        { error: `Invalid model for ${apiProvider}: ${preferredModel}` },
        { status: 400 },
      );
    }
  }

  const updateData: Record<string, unknown> = {
    apiProvider,
    preferredModel: preferredModel || null,
  };

  // Check if provider is changing
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: { apiProvider: true },
  });

  if (currentUser?.apiProvider && currentUser.apiProvider !== apiProvider && !apiKey) {
    // Provider changed but no new key — clear the old one
    updateData.apiKeyEnc = null;
  }

  if (apiKey) {
    updateData.apiKeyEnc = encrypt(apiKey, getEncryptionKey());
  }

  try {
    await prisma.user.update({
      where: { id: session.user.agentUserId },
      data: updateData,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[settings] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
