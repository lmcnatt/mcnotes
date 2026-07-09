import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from './lib/auth';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Define public paths
  const isPublicPath = path === '/login' || path === '/register';
  const isAuthApi = path.startsWith('/api/auth');

  // Skip auth checks for static assets, public files, and auth API routes
  if (
    path.startsWith('/_next') ||
    path.startsWith('/favicon.ico') ||
    isAuthApi
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value || '';

  const verifiedToken = token ? await verifyJWT(token) : null;

  if (isPublicPath) {
    if (verifiedToken) {
      // Redirect authenticated users away from login/register to dashboard
      return NextResponse.redirect(new URL('/', request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!verifiedToken) {
    // Redirect unauthenticated users to login
    if (path.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // Clone headers to inject the authenticated user's username for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-username', verifiedToken.username);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    '/',
    '/login',
    '/register',
    '/api/:path*',
  ],
};
