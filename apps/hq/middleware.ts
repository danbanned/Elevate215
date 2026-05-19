import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/auth/signin', '/api/auth', '/api/health'];

export default auth((req) => {
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
