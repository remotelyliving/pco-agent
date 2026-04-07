import { describe, it, expect, vi } from 'vitest';

// Mock Prisma before importing auth (which imports db → PrismaClient)
vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn(function (this: Record<string, unknown>) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
  });
  return { PrismaClient: MockPrismaClient };
});

const { authConfig } = await import('@/lib/auth');

describe('auth config', () => {
  it('has planning-center provider', () => {
    const providers = authConfig.providers;
    expect(providers).toHaveLength(1);
    const pco = providers[0] as Record<string, unknown>;
    expect(pco.id).toBe('planning-center');
  });

  it('has correct authorization URL', () => {
    const pco = authConfig.providers[0] as Record<string, unknown>;
    const authorization = pco.authorization as { url: string };
    expect(authorization.url).toContain('planningcenteronline.com');
  });

  it('requests people and services scopes', () => {
    const pco = authConfig.providers[0] as Record<string, unknown>;
    const authorization = pco.authorization as {
      url: string;
      params: { scope: string };
    };
    expect(authorization.params.scope).toBe('people services');
  });

  it('has correct token URL', () => {
    const pco = authConfig.providers[0] as Record<string, unknown>;
    expect(pco.token).toBe(
      'https://api.planningcenteronline.com/oauth/token'
    );
  });

  it('uses state check instead of PKCE', () => {
    const pco = authConfig.providers[0] as Record<string, unknown>;
    expect(pco.checks).toEqual(['state']);
  });

  it('has userinfo configuration with custom request handler', () => {
    const pco = authConfig.providers[0] as Record<string, unknown>;
    const userinfo = pco.userinfo as { url: string; request: Function };
    expect(userinfo.url).toContain('planningcenteronline.com');
    expect(typeof userinfo.request).toBe('function');
  });

  it('has signIn callback', () => {
    expect(authConfig.callbacks?.signIn).toBeDefined();
  });

  it('has jwt callback', () => {
    expect(authConfig.callbacks?.jwt).toBeDefined();
  });

  it('has session callback', () => {
    expect(authConfig.callbacks?.session).toBeDefined();
  });

  it('redirects to /login for sign in', () => {
    expect(authConfig.pages?.signIn).toBe('/login');
  });
});
