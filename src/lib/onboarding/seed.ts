import { prisma } from '@/lib/db';

export async function buildSeedMessage(userId: string, orgId: string): Promise<string> {
  const [orgMemoryCount, user] = await Promise.all([
    prisma.memory.count({ where: { orgId, userId: null } }),
    prisma.user.findUnique({
      where: { id: userId },
      include: { org: { select: { name: true } } },
    }),
  ]);

  const name = user?.name ?? 'there';
  const greeting = `Hey ${name}!`;

  if (orgMemoryCount > 0) {
    const churchName = user?.org?.name ?? 'your church';
    return `${greeting} I'm Service Planner — I'll be helping you work with your Planning Center data. I already know a bit about ${churchName} from your team, but I'd like to learn about you specifically. Anything you share is saved to your account so I can help you better. What's your role there?`;
  }

  return `${greeting} I'm Service Planner — I'll be helping you work with your Planning Center data through conversation. Before we dive in, I'd love to learn a little about you and your church so I can be as helpful as possible. Anything you share here is saved to your account to personalize your experience — only you and your church's admins can see it. What's your role at your church?`;
}

export async function getExistingOnboardingConversation(userId: string): Promise<string | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { userId, title: 'Getting Started' },
    select: { id: true },
  });
  return conversation?.id ?? null;
}
