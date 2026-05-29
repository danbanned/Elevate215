import Link from 'next/link';
import { auth, signIn, signOut } from '@/auth';

export async function Nav() {
  const session = await auth();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
            LP Internal AI
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/" className="hover:text-ink">
              Home
            </Link>
            <Link href="/dashboard" className="hover:text-ink">
              Dashboard
            </Link>
            <Link href="/sync" className="hover:text-ink">
              Sync
            </Link>
            <Link href="/tools" className="hover:text-ink">
              Tool Log
            </Link>
          </nav>
        </div>
        <div className="text-sm text-muted">
          {session?.user ? (
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/auth/signin' });
              }}
              className="flex items-center gap-3"
            >
              <span>{session.user.email}</span>
              <button type="submit" className="rounded border px-2 py-1 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          ) : (
            <form
              action={async () => {
                'use server';
                await signIn('google');
              }}
            >
              <button type="submit" className="rounded border px-2 py-1 hover:bg-slate-100">
                Sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
