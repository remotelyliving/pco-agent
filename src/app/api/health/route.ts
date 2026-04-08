import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[health] Database check failed', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    );
  }
}
