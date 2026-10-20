import { registerOAuthClient } from '../../../../lib/db.ts';

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientName = body.client_name || 'MCP Client';
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris
      : body.redirect_uri
      ? [body.redirect_uri]
      : [];

    if (redirectUris.length === 0) {
      return Response.json(
        { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const authMethod = body.token_endpoint_auth_method || 'none';
    const client = registerOAuthClient({
      clientName,
      redirectUris,
    });

    const responsePayload: Record<string, any> = {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    if (authMethod !== 'none' && client.client_secret) {
      responsePayload.client_secret = client.client_secret;
      responsePayload.client_secret_expires_at = 0; // does not expire
    }

    return Response.json(responsePayload, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('Failed to register OAuth client:', err);
    return Response.json(
      { error: 'server_error', error_description: err.message || 'Registration failed' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
