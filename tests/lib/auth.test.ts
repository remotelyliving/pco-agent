import { describe, it, expect, vi } from 'vitest';

// Mock Prisma before importing auth (which imports db → PrismaClient)
vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn(function (this: Record<string, unknown>) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
  });
  const UserRole = { admin: 'admin', editor: 'editor', member: 'member' } as const;
  const Prisma = { TransactionIsolationLevel: { Serializable: 'Serializable' } };
  return { PrismaClient: MockPrismaClient, UserRole, Prisma };
});

const { authConfig, mapPcoRole, canManageRules } = await import('@/lib/auth');

describe('auth config', () => {
  it('has planning-center provider', () => {
    const providers = authConfig.providers;
    expect(providers).toHaveLength(1);
    const pco = providers[0] as unknown as Record<string, unknown>;
    expect(pco.id).toBe('planning-center');
  });

  it('has correct authorization URL', () => {
    const pco = authConfig.providers[0] as unknown as Record<string, unknown>;
    const authorization = pco.authorization as { url: string };
    expect(authorization.url).toContain('planningcenteronline.com');
  });

  it('requests people and services scopes', () => {
    const pco = authConfig.providers[0] as unknown as Record<string, unknown>;
    const authorization = pco.authorization as {
      url: string;
      params: { scope: string };
    };
    expect(authorization.params.scope).toBe('people services');
  });

  it('has correct token URL', () => {
    const pco = authConfig.providers[0] as unknown as Record<string, unknown>;
    expect(pco.token).toBe(
      'https://api.planningcenteronline.com/oauth/token'
    );
  });

  it('uses state check instead of PKCE', () => {
    const pco = authConfig.providers[0] as unknown as Record<string, unknown>;
    expect(pco.checks).toEqual(['state']);
  });

  it('has userinfo configuration with custom request handler', () => {
    const pco = authConfig.providers[0] as unknown as Record<string, unknown>;
    const userinfo = pco.userinfo as { url: string; request: (...args: unknown[]) => unknown };
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

  describe('signIn callback', () => {
    const signIn = authConfig.callbacks!.signIn!;

    it('returns false when account is null', async () => {
      const result = await (signIn as CallableFunction)({ user: {}, account: null });
      expect(result).toBe(false);
    });

    it('returns false when provider is not planning-center', async () => {
      const result = await (signIn as CallableFunction)({
        user: {},
        account: { provider: 'github' },
      });
      expect(result).toBe(false);
    });

    it('returns false when pcoOrgId is missing', async () => {
      const result = await (signIn as CallableFunction)({
        user: { pcoPersonId: '123' },
        account: { provider: 'planning-center' },
      });
      expect(result).toBe(false);
    });

    it('returns false when pcoPersonId is missing', async () => {
      const result = await (signIn as CallableFunction)({
        user: { pcoOrgId: '456' },
        account: { provider: 'planning-center' },
      });
      expect(result).toBe(false);
    });
  });

  describe('session callback', () => {
    const sessionCb = authConfig.callbacks!.session!;

    it('maps token fields to session with fallbacks', async () => {
      const result = await (sessionCb as CallableFunction)({
        session: { user: { name: 'Test', email: 'test@test.com' }, expires: '' },
        token: {
          agentUserId: 'user-1',
          orgId: 'org-1',
          role: 'admin',
        },
      }) as { user: Record<string, string> };
      expect(result.user.agentUserId).toBe('user-1');
      expect(result.user.orgId).toBe('org-1');
      expect(result.user.role).toBe('admin');
    });

    it('uses fallback values when token fields are missing', async () => {
      const result = await (sessionCb as CallableFunction)({
        session: { user: { name: 'Test' }, expires: '' },
        token: {},
      }) as { user: Record<string, string> };
      expect(result.user.agentUserId).toBe('');
      expect(result.user.orgId).toBe('');
      expect(result.user.role).toBe('member');
    });
  });
});

describe('mapPcoRole', () => {
  it('maps site_administrator to admin', () => {
    expect(mapPcoRole({ pcoSiteAdmin: true, pcoPeoplePermissions: null })).toBe('admin');
  });

  it('maps site_administrator even with lower people_permissions', () => {
    expect(mapPcoRole({ pcoSiteAdmin: true, pcoPeoplePermissions: 'Viewer' })).toBe('admin');
  });

  it('maps Manager to admin', () => {
    expect(mapPcoRole({ pcoSiteAdmin: false, pcoPeoplePermissions: 'Manager' })).toBe('admin');
  });

  it('maps Editor to editor', () => {
    expect(mapPcoRole({ pcoSiteAdmin: false, pcoPeoplePermissions: 'Editor' })).toBe('editor');
  });

  it('maps Viewer to member', () => {
    expect(mapPcoRole({ pcoSiteAdmin: false, pcoPeoplePermissions: 'Viewer' })).toBe('member');
  });

  it('maps null permissions to member', () => {
    expect(mapPcoRole({ pcoSiteAdmin: false, pcoPeoplePermissions: null })).toBe('member');
  });

  it('maps undefined permissions to member', () => {
    expect(mapPcoRole({})).toBe('member');
  });
});

describe('canManageRules', () => {
  it('returns true for admin', () => {
    expect(canManageRules('admin')).toBe(true);
  });

  it('returns true for editor', () => {
    expect(canManageRules('editor')).toBe(true);
  });

  it('returns false for member', () => {
    expect(canManageRules('member')).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(canManageRules('viewer')).toBe(false);
  });
});
