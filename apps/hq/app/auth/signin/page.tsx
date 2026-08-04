import { signIn } from '@/auth';

const ALLOWED_DOMAINS = (process.env['AUTH_ALLOWED_DOMAIN'] ?? 'launchpadphilly.org')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm rounded-lg border bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Restricted to{' '}
        {ALLOWED_DOMAINS.map((d, i) => (
          <span key={d}>
            {i > 0 && ' / '}
            <code>@{d}</code>
          </span>
        ))}{' '}
        Google accounts.
      </p>
      <form
        className="mt-6"
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
      >
        <button
          type="submit"
          className="w-full rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Continue with Google
        </button>
      </form>
    </div>
  );
}
