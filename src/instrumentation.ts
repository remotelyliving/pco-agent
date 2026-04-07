// src/instrumentation.ts
export async function register() {
  // Only validate in server runtime (not during build or edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('@/lib/env');
    try {
      validateEnv();
    } catch (error) {
      console.error('[startup] Environment validation failed:', error);
      // Don't process.exit — let Next.js handle the error
      // But log it clearly so operators know what's wrong
    }
  }
}
