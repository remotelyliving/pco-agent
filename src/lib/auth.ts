import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Prisma, UserRole } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      agentUserId: string;
      orgId: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    // Passed through session callback for server-side API routes.
    // getToken() from next-auth/jwt is deprecated in v5 and returns null.
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    agentUserId?: string;
    orgId?: string;
    role?: string;
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
    pcoAccessTokenExpires?: number;
    roleCheckedAt?: number;
  }
}

/**
 * Map PCO permissions to pco-agent role.
 * site_administrator → admin
 * people_permissions "Manager" → admin
 * people_permissions "Editor" → editor
 * everything else → member
 */
export function mapPcoRole(profile: Record<string, unknown>): UserRole {
  if (profile.pcoSiteAdmin === true) return UserRole.admin;
  const perms = profile.pcoPeoplePermissions as string | null;
  if (perms === 'Manager') return UserRole.admin;
  if (perms === 'Editor') return UserRole.editor;
  return UserRole.member;
}

/** Returns true if the role can manage rules (create, edit, delete org rules). */
export function canManageRules(role: string): boolean {
  return role === UserRole.admin || role === UserRole.editor;
}

export const authConfig: NextAuthConfig = {
  providers: [
    {
      id: 'planning-center',
      name: 'Planning Center',
      type: 'oauth',
      clientId: process.env.PCO_CLIENT_ID!,
      clientSecret: process.env.PCO_CLIENT_SECRET!,
      authorization: {
        url: 'https://api.planningcenteronline.com/oauth/authorize',
        params: { scope: 'people services' },
      },
      token: 'https://api.planningcenteronline.com/oauth/token',
      userinfo: {
        url: 'https://api.planningcenteronline.com/people/v2/me',
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const res = await fetch(
            'https://api.planningcenteronline.com/people/v2/me',
            {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) {
            throw new Error(`PCO userinfo request failed: ${res.status}`);
          }
          const json = await res.json();
          const person = json.data;
          const org = json.meta?.parent;
          const orgName = org?.attributes?.name || json.meta?.organization?.attributes?.name;
          if (!orgName) {
            logger.warn('[auth] PCO /me did not return org name', {
              metaKeys: Object.keys(json.meta || {}),
              parentKeys: org ? Object.keys(org) : [],
              parentAttrKeys: org?.attributes ? Object.keys(org.attributes) : [],
            });
          }
          return {
            id: person.id,
            name: `${person.attributes.first_name} ${person.attributes.last_name}`,
            email:
              person.attributes.email_addresses?.[0]?.address ?? null,
            pcoPersonId: person.id,
            pcoOrgId: org?.id,
            pcoOrgName: orgName,
            pcoSiteAdmin: person.attributes.site_administrator === true,
            pcoPeoplePermissions: person.attributes.people_permissions ?? null,
          };
        },
      },
      profile(profile: Record<string, unknown>) {
        return {
          id: profile.id as string,
          name: profile.name as string,
          email: profile.email as string | null,
          pcoPersonId: profile.pcoPersonId,
          pcoOrgId: profile.pcoOrgId,
          pcoOrgName: profile.pcoOrgName,
          pcoSiteAdmin: profile.pcoSiteAdmin,
          pcoPeoplePermissions: profile.pcoPeoplePermissions,
        };
      },
      // PCO OAuth does not support PKCE
      checks: ['state'],
    },
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'planning-center') return false;

      const profile = user as Record<string, unknown>;
      if (!profile.pcoOrgId || !profile.pcoPersonId) {
        logger.error('signIn failed: missing pcoOrgId or pcoPersonId', {
          hasPcoOrgId: !!profile.pcoOrgId,
          hasPcoPersonId: !!profile.pcoPersonId,
        });
        return false;
      }

      try {
        // Upsert organization
        const org = await prisma.organization.upsert({
          where: { pcoOrgId: String(profile.pcoOrgId) },
          update: { name: profile.pcoOrgName ? String(profile.pcoOrgName) : 'Unknown' },
          create: {
            pcoOrgId: String(profile.pcoOrgId),
            name: profile.pcoOrgName ? String(profile.pcoOrgName) : 'Unknown',
          },
        });

        // Derive role from PCO permissions (synced on every login)
        const role = mapPcoRole(profile);

        const agentUser = await prisma.$transaction(async (tx) => {
          return tx.user.upsert({
            where: {
              orgId_pcoPersonId: {
                orgId: org.id,
                pcoPersonId: BigInt(String(profile.pcoPersonId)),
              },
            },
            update: {
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
            create: {
              orgId: org.id,
              pcoPersonId: BigInt(String(profile.pcoPersonId)),
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        // Attach to user so jwt callback doesn't need to re-query
        (user as Record<string, unknown>).agentUserId = agentUser.id;
        (user as Record<string, unknown>).orgId = org.id;
        (user as Record<string, unknown>).agentRole = agentUser.role;

        return true;
      } catch (error) {
        logger.error('signIn failed: database error', {
          pcoOrgId: profile.pcoOrgId,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const profile = user as Record<string, unknown>;
        token.agentUserId = profile.agentUserId as string;
        token.orgId = profile.orgId as string;
        token.role = profile.agentRole as string;
        token.pcoAccessToken = account.access_token ?? undefined;
        token.pcoRefreshToken = account.refresh_token ?? undefined;
        token.pcoAccessTokenExpires = account.expires_at;
      }

      // Refresh PCO token if expired, missing, or expiring within 5 minutes
      if (!user && token.pcoRefreshToken) {
        const now = Math.floor(Date.now() / 1000);
        const needsRefresh = !token.pcoAccessToken
          || !token.pcoAccessTokenExpires
          || (token.pcoAccessTokenExpires as number) - now < 300;

        if (needsRefresh) {
          try {
            const response = await fetch('https://api.planningcenteronline.com/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: token.pcoRefreshToken as string,
                client_id: process.env.PCO_CLIENT_ID!,
                client_secret: process.env.PCO_CLIENT_SECRET!,
              }),
              signal: AbortSignal.timeout(10000),
            });

            if (response.ok) {
              const tokens = await response.json();
              token.pcoAccessToken = tokens.access_token;
              token.pcoRefreshToken = tokens.refresh_token ?? token.pcoRefreshToken;
              token.pcoAccessTokenExpires = tokens.expires_in
                ? now + tokens.expires_in
                : token.pcoAccessTokenExpires;
            } else {
              logger.error('PCO token refresh failed', { status: response.status });
              token.pcoAccessToken = undefined;
              token.pcoAccessTokenExpires = undefined;
            }
          } catch (error) {
            logger.error('PCO token refresh error', {
              error: error instanceof Error ? error.message : String(error),
            });
            token.pcoAccessToken = undefined;
            token.pcoAccessTokenExpires = undefined;
          }
        }
      }

      // Re-sync role from DB every 15 minutes
      if (!user && token.agentUserId) {
        const now2 = Math.floor(Date.now() / 1000);
        const lastCheck = (token.roleCheckedAt as number) ?? 0;
        if (now2 - lastCheck > 900) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.agentUserId as string },
              select: { role: true },
            });
            if (dbUser) {
              token.role = dbUser.role;
            }
            token.roleCheckedAt = now2;
          } catch (error) {
            logger.error('JWT role re-sync failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          agentUserId: (token.agentUserId as string) ?? '',
          orgId: (token.orgId as string) ?? '',
          role: (token.role as string) ?? 'member',
        },
        pcoAccessToken: token.pcoAccessToken as string | undefined,
        pcoRefreshToken: token.pcoRefreshToken as string | undefined,
      };
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
