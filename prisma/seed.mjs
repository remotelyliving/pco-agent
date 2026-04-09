import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_RULES = [
  { id: 'system-scheduling-blockout', content: "Always check a person's blockout dates before scheduling them for a service.", category: 'scheduling' },
  { id: 'system-general-confirm', content: 'Confirm with the user before creating, updating, or removing any records.', category: 'general' },
  { id: 'system-scheduling-fair-rotation', content: 'When scheduling volunteers, check when they last served to distribute fairly.', category: 'scheduling' },
  { id: 'system-scheduling-song-repeat', content: 'When planning songs for a service, check when each song was last used to avoid repeating too soon.', category: 'scheduling' },
  { id: 'system-general-plain-language', content: 'Use plain, friendly language. Avoid technical jargon.', category: 'general' },
  { id: 'system-people-contact-info', content: 'When showing lists of people, include their role and contact info when available.', category: 'people' },
  { id: 'system-general-admit-uncertainty', content: "If you're unsure about something, say so rather than guessing.", category: 'general' },
];

console.log('Seeding system default rules...');

for (const rule of SYSTEM_RULES) {
  await prisma.rule.upsert({
    where: { id: rule.id },
    update: {
      content: rule.content,
      category: rule.category,
      ruleType: 'system',
      visibility: 'org',
    },
    create: {
      id: rule.id,
      content: rule.content,
      category: rule.category,
      ruleType: 'system',
      visibility: 'org',
    },
  });
}

console.log(`Seeded ${SYSTEM_RULES.length} system rules.`);
await prisma.$disconnect();
