import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { getEncryptionKey } from '@/lib/env';

export async function GET() {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.agentUserId },
    select: { apiProvider: true, preferredModel: true, apiKeyEnc: true },
  });

  return Response.json({
    apiProvider: user?.apiProvider || null,
    preferredModel: user?.preferredModel || null,
    hasApiKey: !!user?.apiKeyEnc,
  });
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

  const updateData: Record<string, unknown> = {
    apiProvider,
    preferredModel: preferredModel || null,
  };

  if (apiKey) {
    updateData.apiKeyEnc = encrypt(apiKey, getEncryptionKey());
  }

  await prisma.user.update({
    where: { id: session.user.agentUserId },
    data: updateData,
  });

  return Response.json({ success: true });
}
