// Stub for next/server so next-auth can be imported in vitest
export class NextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.toString());
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  }
  static redirect(url: string | URL, status?: number) {
    return new Response(null, {
      status: status ?? 302,
      headers: { Location: typeof url === 'string' ? url : url.toString() },
    });
  }
}
