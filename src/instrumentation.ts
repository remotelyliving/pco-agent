export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    const { logger } = await import('@/lib/logger');
    try {
      validateEnv();
    } catch (error) {
      console.error('[startup] Environment validation failed:', error);
      process.exit(1);
    }

    const shutdown = async () => {
      logger.info('[shutdown] Signal received, cleaning up');
      const { shutdownPool } = await import('@/lib/mcp-pool');
      await shutdownPool();
      const { prisma } = await import('@/lib/db');
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
