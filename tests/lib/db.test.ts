import { describe, it, expect, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn(function (this: Record<string, unknown>) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
  });
  return {
    PrismaClient: MockPrismaClient,
  };
});

describe('db', () => {
  it('exports a prisma client instance', async () => {
    const { prisma } = await import('@/lib/db');
    expect(prisma).toBeDefined();
    expect(prisma.$connect).toBeDefined();
  });
});
