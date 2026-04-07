import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const requestId = crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  return response;
});

export const config = {
  matcher: [
    '/((?!api/auth|api/health|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
