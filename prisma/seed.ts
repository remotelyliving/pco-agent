import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_RULES = [
  {
    content: 'Always check a person\'s blockout dates before scheduling them for a service.',
    category: 'scheduling',
  },
  {
    content: 'Confirm with the user before creating, updating, or removing any records.',
    category: 'general',
  },
  {
    content: 'When scheduling volunteers, check when they last served to distribute fairly.',
    category: 'scheduling',
  },
  {
    content: 'When planning songs for a service, check when each song was last used to avoid repeating too soon.',
    category: 'scheduling',
  },
  {
    content: 'Use plain, friendly language. Avoid technical jargon.',
    category: 'general',
  },
  {
    content: 'When showing lists of people, include their role and contact info when available.',
    category: 'people',
  },
  {
    content: 'If you\'re unsure about something, say so rather than guessing.',
    category: 'general',
  },
];

async function main() {
  console.log('Seeding system default rules...');

  for (const rule of SYSTEM_RULES) {
    await prisma.rule.upsert({
      where: {
        id: `system-${rule.category}-${SYSTEM_RULES.indexOf(rule)}`,
      },
      update: { content: rule.content },
      create: {
        id: `system-${rule.category}-${SYSTEM_RULES.indexOf(rule)}`,
        content: rule.content,
        category: rule.category,
        ruleType: 'system',
        visibility: 'org',
      },
    });
  }

  console.log(`Seeded ${SYSTEM_RULES.length} system rules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
