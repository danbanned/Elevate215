import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';

const ALLOWED_DOMAINS = (process.env['AUTH_ALLOWED_DOMAIN'] ?? 'launchpadphilly.org')
  .split(',')
  .map((d) => d.trim().toLowerCase());

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
      const email = (profile?.email ?? '').toLowerCase();
      return ALLOWED_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
} satisfies NextAuthConfig;
