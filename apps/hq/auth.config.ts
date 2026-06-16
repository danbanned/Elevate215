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
      const allowed = email.endsWith(`@${ALLOWED_DOMAIN}`);
      if (!allowed) {
        process.stdout.write(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'auth_signin_rejected',
            email,
            reason: 'domain_not_allowed',
          }) + '\n',
        );
      }
      return allowed;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
} satisfies NextAuthConfig;
