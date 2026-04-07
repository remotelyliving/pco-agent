import { prisma } from '@/lib/db';

export async function needsSetup(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiProvider: true, apiKeyEnc: true },
  });
  return !user?.apiProvider || !user?.apiKeyEnc;
}
