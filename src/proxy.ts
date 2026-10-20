import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from './lib/auth';
import { getUserByUsername } from './lib/db';

// Next.js 16 renamed the `middleware` file convention to `proxy`.
// Proxy runs on the Node.js runtime by default, so it can use better-sqlite3 to
// validate the session against the database on every request.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Define public paths
  const isPublicPath = path === '/login' || path === '/register';
  const isPublicAuthApi =
    path === '/api/auth/login' ||
    path === '/api/auth/register' ||
    path === '/api/auth/logout' ||
    path === '/api/auth/registration-status';
  const isHealthCheck = path === '/api/health';
  const isMcpApi = path.startsWith('/api/mcp');
  const isWellKnown = path.startsWith('/.well-known/');
  const isOAuthApi = path.startsWith('/api/oauth/');
  const isOAuthAuthorize = path === '/oauth/authorize';

  // Skip auth checks for static assets, public files, health checks, and public auth API routes
  if (
    path.startsWith('/_next') ||
    path.startsWith('/favicon.ico') ||
    isHealthCheck ||
    isPublicAuthApi
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value || '';

  const decoded = token ? await verifyJWT(token) : null;

  // A token is only valid if its user still exists and its version matches.
  // Old tokens without `tv` are treated as version 0.
  let verifiedToken: { username: string } | null = null;
  let staleToken = false;
  if (decoded) {
    const user = getUserByUsername(decoded.username);
    if (user && (decoded.tv ?? 0) === (user.token_version ?? 0)) {
      verifiedToken = decoded;
    } else {
      staleToken = true;
    }
  }

  if (isPublicPath) {
    if (verifiedToken) {
      // Redirect authenticated users away from login/register to dashboard
      return NextResponse.redirect(new URL('/', request.nextUrl));
    }
    const res = NextResponse.next();
    if (staleToken) res.cookies.delete('auth_token');
    return res;
  }

  // MCP, OAuth endpoints, and RFC discovery routes manage their own authentication
  // (Bearer PAT, PKCE codes, or inline authorization consent).
  // If a valid session cookie exists, attach x-user-username so handlers can use it.
  if (isWellKnown || isOAuthApi || isOAuthAuthorize || isMcpApi) {
    const requestHeaders = new Headers(request.headers);
    if (verifiedToken) {
      requestHeaders.set('x-user-username', verifiedToken.username);
    }
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    if (staleToken) res.cookies.delete('auth_token');
    return res;
  }

  if (!verifiedToken) {
    // Redirect unauthenticated users to login
    const res = path.startsWith('/api')
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.nextUrl));
    if (staleToken) res.cookies.delete('auth_token');
    return res;
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
    '/settings',
    '/change-password',
    '/oauth/authorize',
    '/.well-known/:path*',
    '/api/:path*',
  ],
};
