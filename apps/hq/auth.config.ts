import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

const ALLOWED_DOMAIN = process.env['AUTH_ALLOWED_DOMAIN'] ?? 'launchpadphilly.org';

export default {
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
} satisfies NextAuthConfig;
