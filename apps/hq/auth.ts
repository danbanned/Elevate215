import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@lp-ai/db';

const ALLOWED_DOMAIN = process.env['AUTH_ALLOWED_DOMAIN'] ?? 'launchpadphilly.org';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env['AUTH_GOOGLE_ID'] ?? '',
      clientSecret: process.env['AUTH_GOOGLE_SECRET'] ?? '',
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email ?? '';
      return email.endsWith(`@${ALLOWED_DOMAIN}`);
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
});
