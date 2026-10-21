import { getSessionUser } from '../../../../lib/auth.ts';
import { getOAuthClient, createOAuthCode } from '../../../../lib/db.ts';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json(
        { error: 'unauthorized', error_description: 'User not logged in' },
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const body = await request.json();
    const { client_id, redirect_uri, code_challenge, code_challenge_method, state } = body;

    if (!client_id || !redirect_uri || !code_challenge) {
      return Response.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const client = getOAuthClient(client_id);
    if (!client) {
      return Response.json(
        { error: 'invalid_client', error_description: 'Unknown client_id' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Validate redirect_uri matches registered URIs (or exact prefix)
    const isAllowedUri = client.redirect_uris.some((uri) => {
      return uri === redirect_uri || redirect_uri.startsWith(uri);
    });

    if (!isAllowedUri) {
      return Response.json(
        { error: 'invalid_request', error_description: 'redirect_uri is not authorized for this client' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const code = createOAuthCode({
      clientId: client_id,
      userId: String(user.id),
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
    });

    const targetUrl = new URL(redirect_uri);
    targetUrl.searchParams.set('code', code);
    if (state) {
      targetUrl.searchParams.set('state', state);
    }
    // RFC 9207 Issuer Identification in authorization response
    targetUrl.searchParams.set('iss', getOrigin(request));

    return Response.json(
      { redirectUrl: targetUrl.toString() },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err: any) {
    console.error('OAuth authorization error:', err);
    return Response.json(
      { error: 'server_error', error_description: err.message || 'Authorization failed' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
