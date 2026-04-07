import { prisma } from '@/lib/db';
import { getPoolSize } from '@/lib/mcp-pool';

export async function GET() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mcpPoolSize: getPoolSize(),
    });
  } catch (error) {
    console.error('[health] Database check failed:', error);
    return Response.json(
      { status: 'error', message: 'Database unavailable' },
      { status: 503 }
    );
  }
}
