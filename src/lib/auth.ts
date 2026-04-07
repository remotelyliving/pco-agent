import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

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
    // NO pcoAccessToken here — it stays in JWT only
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
  }
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
          return {
            id: person.id,
            name: `${person.attributes.first_name} ${person.attributes.last_name}`,
            email:
              person.attributes.email_addresses?.[0]?.address ?? null,
            pcoPersonId: person.id,
            pcoOrgId: org?.id,
            pcoOrgName: org?.attributes?.name,
          };
        },
      },
      profile(profile: Record<string, unknown>) {
        return {
          id: profile.id as string,
          name: profile.name as string,
          email: profile.email as string | null,
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

        // First user in org = admin, rest = member (atomic transaction to prevent race condition)
        const agentUser = await prisma.$transaction(async (tx) => {
          const existingUsers = await tx.user.count({
            where: { orgId: org.id },
          });
          const role = existingUsers === 0 ? 'admin' : 'member';

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
            },
            create: {
              orgId: org.id,
              pcoPersonId: BigInt(String(profile.pcoPersonId)),
              name: profile.name as string,
              email: profile.email as string | null,
              role,
            },
          });
        });

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

      // Refresh PCO token if it expires within 5 minutes
      if (!user && token.pcoAccessToken && token.pcoAccessTokenExpires) {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = (token.pcoAccessTokenExpires as number) - now;

        if (expiresIn < 300) {
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
            }
          } catch (error) {
            logger.error('PCO token refresh error', {
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
        // pcoAccessToken removed — access via JWT in server-side code only
      };
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
