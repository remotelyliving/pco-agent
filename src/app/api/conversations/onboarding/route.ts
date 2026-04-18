import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { MessageRole } from '@prisma/client';
import { buildSeedMessage, getExistingOnboardingConversation } from '@/lib/onboarding/seed';

export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.agentUserId;
  const orgId = session.user.orgId;

  try {
    const existingId = await getExistingOnboardingConversation(userId);
    if (existingId) {
      return Response.json({ conversationId: existingId });
    }

    const seedMessage = await buildSeedMessage(userId, orgId);

    const conversation = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: { userId, title: 'Getting Started' },
      });
      await tx.message.create({
        data: {
          conversationId: conv.id,
          role: MessageRole.assistant,
          content: seedMessage,
        },
      });
      return conv;
    });

    logger.info('[onboarding] Created onboarding conversation', { conversationId: conversation.id });
    return Response.json({ conversationId: conversation.id });
  } catch (error) {
    logger.error('[onboarding] Error creating onboarding conversation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
