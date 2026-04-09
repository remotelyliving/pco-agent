import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { checkRateLimit, startPeriodicCleanup } from '@/lib/rate-limit';

// Start periodic cleanup when middleware module is loaded
startPeriodicCleanup();

// Rate limit configuration: route pattern → requests per minute
const RATE_LIMITS: Record<string, number> = {
  '/api/chat': 20,
  '/api/settings/test': 5,
  '/api/settings': 10,
  '/api/rules': 60,
  '/api/rules/:id': 60,
  '/api/rules/toggle': 60,
  '/api/memory': 60,
  '/api/memory/:id': 60,
  '/api/conversations': 20,
  '/api/conversations/:id': 60,
  '/api/files': 60,
  '/api/files/:id': 60,
};
const DEFAULT_RATE_LIMIT = 60;

/**
 * Check if a route is public (skips auth and rate limiting).
 */
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname.startsWith('/api/auth/')) return true;
  return false;
}

/**
 * Normalize a request path to a route pattern.
 * e.g., /api/rules/abc-123 → /api/rules/:id
 */
function normalizeRoute(pathname: string): string {
  if (/^\/api\/rules\/toggle$/.test(pathname)) return '/api/rules/toggle';
  if (/^\/api\/settings\/test$/.test(pathname)) return '/api/settings/test';
  if (/^\/api\/rules\/[^/]+$/.test(pathname)) return '/api/rules/:id';
  if (/^\/api\/memory\/[^/]+$/.test(pathname)) return '/api/memory/:id';
  if (/^\/api\/conversations\/[^/]+$/.test(pathname)) return '/api/conversations/:id';
  return pathname;
}

export default auth((req) => {
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const pathname = req.nextUrl.pathname;

  // Build CSP header
  const isDev = process.env.NODE_ENV === 'development';
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // --- Centralized auth + rate limiting for API routes ---
  if (pathname.startsWith('/api/')) {
    const isPublic = isPublicRoute(pathname);

    if (!isPublic) {
      // Auth enforcement
      const userId = req.auth?.user?.agentUserId;
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Rate limiting
      const routePattern = normalizeRoute(pathname);
      const limit = RATE_LIMITS[routePattern] ?? DEFAULT_RATE_LIMIT;
      const key = `${routePattern}:${userId}`;
      const result = checkRateLimit(key, limit);

      if (!result.allowed) {
        return Response.json(
          { error: "You're sending requests too quickly. Please wait a moment and try again." },
          { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
        );
      }
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
});

export const config = {
  matcher: [
    {
      source: '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
