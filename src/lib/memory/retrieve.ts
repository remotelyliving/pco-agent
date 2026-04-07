import { getAllMemoriesForUser } from '@/lib/memory/queries';

export async function getMemoryPrompt(orgId: string, userId: string): Promise<string> {
  const memories = await getAllMemoriesForUser(orgId, userId);

  if (memories.length === 0) return '';

  const orgMemories = memories.filter((m) => m.userId === null);
  const userMemories = memories.filter((m) => m.userId !== null);

  const sections: string[] = [];

  if (orgMemories.length > 0) {
    const lines = orgMemories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
    sections.push(`## Known facts about this church\n\n${lines}`);
  }

  if (userMemories.length > 0) {
    const lines = userMemories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
    sections.push(`## Your personal notes\n\n${lines}`);
  }

  return sections.join('\n\n');
}
