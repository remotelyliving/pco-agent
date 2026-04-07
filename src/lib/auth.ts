import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { prisma } from '@/lib/db';

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
    pcoAccessToken: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    agentUserId?: string;
    orgId?: string;
    role?: string;
    pcoAccessToken?: string;
    pcoRefreshToken?: string;
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
        async request({ tokens }) {
          const res = await fetch(
            'https://api.planningcenteronline.com/people/v2/me',
            {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
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
      if (!profile.pcoOrgId || !profile.pcoPersonId) return false;

      // Upsert organization
      const org = await prisma.organization.upsert({
        where: { pcoOrgId: String(profile.pcoOrgId) },
        update: { name: profile.pcoOrgName ? String(profile.pcoOrgName) : 'Unknown' },
        create: {
          pcoOrgId: String(profile.pcoOrgId),
          name: profile.pcoOrgName ? String(profile.pcoOrgName) : 'Unknown',
        },
      });

      // First user in org = admin, rest = member
      const existingUsers = await prisma.user.count({
        where: { orgId: org.id },
      });
      const role = existingUsers === 0 ? 'admin' : 'member';

      // Upsert user
      await prisma.user.upsert({
        where: {
          orgId_pcoPersonId: {
            orgId: org.id,
            pcoPersonId: BigInt(profile.pcoPersonId as number),
          },
        },
        update: {
          name: profile.name as string,
          email: profile.email as string | null,
        },
        create: {
          orgId: org.id,
          pcoPersonId: BigInt(profile.pcoPersonId as number),
          name: profile.name as string,
          email: profile.email as string | null,
          role,
        },
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const profile = user as Record<string, unknown>;
        const org = await prisma.organization.findUnique({
          where: { pcoOrgId: String(profile.pcoOrgId) },
        });
        if (org) {
          const agentUser = await prisma.user.findUnique({
            where: {
              orgId_pcoPersonId: {
                orgId: org.id,
                pcoPersonId: BigInt(profile.pcoPersonId as number),
              },
            },
          });
          if (agentUser) {
            token.agentUserId = agentUser.id;
            token.orgId = org.id;
            token.role = agentUser.role;
            token.pcoAccessToken = account.access_token ?? undefined;
            token.pcoRefreshToken = account.refresh_token ?? undefined;
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
        pcoAccessToken: (token.pcoAccessToken as string) ?? '',
      };
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
