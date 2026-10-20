import crypto from 'crypto';
import { consumeOAuthCode, getOAuthClient, createApiToken } from '../../../../lib/db.ts';

export const dynamic = 'force-dynamic';

function verifyPKCE(verifier: string, challenge: string, method: string): boolean {
  if (method === 'S256') {
    const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
    return computed === challenge;
  }
  if (method === 'plain') {
    return verifier === challenge;
  }
  return false;
}

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

export async function POST(request: Request) {
  try {
    let grantType: string | null = null;
    let code: string | null = null;
    let redirectUri: string | null = null;
    let clientId: string | null = null;
    let codeVerifier: string | null = null;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      grantType = formData.get('grant_type') as string;
      code = formData.get('code') as string;
      redirectUri = formData.get('redirect_uri') as string;
      clientId = formData.get('client_id') as string;
      codeVerifier = formData.get('code_verifier') as string;
    } else {
      const json = await request.json().catch(() => ({}));
      grantType = json.grant_type;
      code = json.code;
      redirectUri = json.redirect_uri;
      clientId = json.client_id;
      codeVerifier = json.code_verifier;
    }

    // Also check Basic Auth for client_id
    const authHeader = request.headers.get('authorization') || '';
    if (!clientId && authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
        const [u] = decoded.split(':');
        clientId = u;
      } catch {}
    }

    if (grantType !== 'authorization_code') {
      return Response.json(
        { error: 'unsupported_grant_type', error_description: 'Only authorization_code grant is supported' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!code) {
      return Response.json(
        { error: 'invalid_request', error_description: 'Missing code parameter' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const codeRecord = consumeOAuthCode(code);
    if (!codeRecord) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'Invalid, expired, or already used authorization code' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (clientId && codeRecord.client_id !== clientId) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'Client mismatch' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (redirectUri && codeRecord.redirect_uri !== redirectUri) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!codeVerifier) {
      return Response.json(
        { error: 'invalid_request', error_description: 'PKCE code_verifier is required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const isPkceValid = verifyPKCE(
      codeVerifier,
      codeRecord.code_challenge,
      codeRecord.code_challenge_method
    );

    if (!isPkceValid) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Resolve client name for friendly token labelling
    const client = getOAuthClient(codeRecord.client_id);
    const tokenName = client ? `OAuth: ${client.client_name}` : 'OAuth Client';

    const tokenData = await createApiToken(codeRecord.user_id, tokenName);

    return Response.json(
      {
        access_token: tokenData.rawToken,
        token_type: 'Bearer',
        expires_in: 31536000, // 1 year
        scope: 'mcnotes',
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    console.error('OAuth token exchange error:', err);
    return Response.json(
      { error: 'server_error', error_description: err.message || 'Token exchange failed' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
