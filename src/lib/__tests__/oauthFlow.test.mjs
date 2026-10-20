import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createUser,
  deleteUserRecords,
  getOAuthClient,
} from '../db.ts';
import { signJWT } from '../auth.ts';
import { GET as protectedResourceGet } from '../../app/.well-known/oauth-protected-resource/route.ts';
import { GET as authServerGet } from '../../app/.well-known/oauth-authorization-server/route.ts';
import { GET as openidGet } from '../../app/.well-known/openid-configuration/route.ts';
import { GET as mcpGet } from '../../app/api/mcp/route.ts';
import { POST as registerPost } from '../../app/api/oauth/register/route.ts';
import { GET as clientGet } from '../../app/api/oauth/client/route.ts';
import { POST as authorizePost } from '../../app/api/oauth/authorize/route.ts';
import { POST as tokenPost } from '../../app/api/oauth/token/route.ts';

describe('OAuth 2.1 & MCP Authorization Specification Flow', () => {
  let testUser;
  let userSessionCookie;
  const testUsername = `oauth_user_${Date.now()}`;
  let registeredClientId;
  const redirectUri = 'https://ai.google.com/connector/oauth/callback';

  before(async () => {
    testUser = createUser(testUsername, 'password_hash_xyz');
    const token = await signJWT({ username: testUsername });
    userSessionCookie = `auth_token=${token}`;
  });

  after(() => {
    if (testUser?.id) {
      deleteUserRecords(testUser.id, testUsername);
    }
  });

  describe('RFC 9728 & RFC 8414 Discovery Endpoints', () => {
    it('returns RFC 9728 Protected Resource Metadata with CORS', async () => {
      const req = new Request('http://localhost:3000/.well-known/oauth-protected-resource');
      const res = await protectedResourceGet(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');

      const data = await res.json();
      assert.equal(data.resource, 'http://localhost:3000/api/mcp');
      assert.deepEqual(data.authorization_servers, ['http://localhost:3000']);
      assert.deepEqual(data.scopes_supported, ['mcnotes']);
      assert.deepEqual(data.bearer_methods_supported, ['header']);
    });

    it('returns RFC 8414 OAuth Authorization Server Metadata', async () => {
      const req = new Request('http://localhost:3000/.well-known/oauth-authorization-server');
      const res = await authServerGet(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');

      const data = await res.json();
      assert.equal(data.issuer, 'http://localhost:3000');
      assert.equal(data.authorization_endpoint, 'http://localhost:3000/oauth/authorize');
      assert.equal(data.token_endpoint, 'http://localhost:3000/api/oauth/token');
      assert.equal(data.registration_endpoint, 'http://localhost:3000/api/oauth/register');
      assert.deepEqual(data.code_challenge_methods_supported, ['S256']);
    });

    it('OpenID configuration alias matches OAuth server metadata', async () => {
      const req = new Request('http://localhost:3000/.well-known/openid-configuration');
      const res = await openidGet(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.authorization_endpoint, 'http://localhost:3000/oauth/authorize');
    });

    it('returns RFC 9728 WWW-Authenticate & Link headers on 401 unauthenticated probe to /api/mcp', async () => {
      const req = new Request('http://localhost:3000/api/mcp');
      const res = await mcpGet(req);
      assert.equal(res.status, 401);

      const wwwAuth = res.headers.get('www-authenticate');
      assert.ok(wwwAuth, 'Missing WWW-Authenticate header');
      assert.ok(
        wwwAuth.includes('Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"')
      );

      const link = res.headers.get('link');
      assert.ok(link, 'Missing Link header');
      assert.ok(
        link.includes('<http://localhost:3000/.well-known/oauth-authorization-server>; rel="oauth-authorization-server"')
      );
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });
  });

  describe('RFC 7591 Dynamic Client Registration (/api/oauth/register)', () => {
    it('rejects registration request missing redirect_uris', async () => {
      const req = new Request('http://localhost:3000/api/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Test Client' }),
      });
      const res = await registerPost(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'invalid_client_metadata');
    });

    it('successfully registers client and returns client_id', async () => {
      const req = new Request('http://localhost:3000/api/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Gemini Connector',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'none',
        }),
      });
      const res = await registerPost(req);
      assert.equal(res.status, 201);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');

      const data = await res.json();
      assert.ok(data.client_id);
      assert.equal(data.client_name, 'Gemini Connector');
      assert.deepEqual(data.redirect_uris, [redirectUri]);

      registeredClientId = data.client_id;
      const clientInDb = getOAuthClient(registeredClientId);
      assert.ok(clientInDb);
      assert.equal(clientInDb.client_name, 'Gemini Connector');
    });

    it('GET /api/oauth/client returns registered client metadata', async () => {
      const req = new Request(`http://localhost:3000/api/oauth/client?id=${registeredClientId}`);
      const res = await clientGet(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.client_id, registeredClientId);
      assert.equal(data.client_name, 'Gemini Connector');
    });
  });

  describe('OAuth Authorization Code & PKCE Token Exchange Flow', () => {
    // Generate PKCE code_verifier and code_challenge (S256)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    let authCode;

    it('rejects POST /api/oauth/authorize from unauthenticated user with 401', async () => {
      const req = new Request('http://localhost:3000/api/oauth/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
        }),
      });
      const res = await authorizePost(req);
      assert.equal(res.status, 401);
    });

    it('rejects POST /api/oauth/authorize with unregistered redirect_uri', async () => {
      const req = new Request('http://localhost:3000/api/oauth/authorize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': userSessionCookie,
        },
        body: JSON.stringify({
          client_id: registeredClientId,
          redirect_uri: 'https://evil.com/callback',
          code_challenge: codeChallenge,
        }),
      });
      const res = await authorizePost(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'invalid_request');
    });

    it('mints authorization code and returns redirectUrl when user authorizes', async () => {
      const state = 'xyz_state_123';
      const req = new Request('http://localhost:3000/api/oauth/authorize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': userSessionCookie,
        },
        body: JSON.stringify({
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          state,
        }),
      });
      const res = await authorizePost(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.ok(data.redirectUrl);

      const parsedUrl = new URL(data.redirectUrl);
      assert.equal(parsedUrl.origin + parsedUrl.pathname, redirectUri);
      assert.equal(parsedUrl.searchParams.get('state'), state);

      authCode = parsedUrl.searchParams.get('code');
      assert.ok(authCode, 'Expected authorization code in redirect URL');
    });

    it('rejects token exchange when PKCE code_verifier is incorrect', async () => {
      const req = new Request('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code: authCode,
          code_verifier: 'wrong_verifier_string',
        }).toString(),
      });
      const res = await tokenPost(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'invalid_grant');
    });

    it('exchanges code for access token using correct PKCE verifier (single-use code)', async () => {
      // Must generate new code since previous attempt consumes or tests code
      // Let's mint a fresh code
      const freshReq = new Request('http://localhost:3000/api/oauth/authorize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': userSessionCookie,
        },
        body: JSON.stringify({
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        }),
      });
      const freshRes = await authorizePost(freshReq);
      const { redirectUrl } = await freshRes.json();
      const validCode = new URL(redirectUrl).searchParams.get('code');

      const tokenReq = new Request('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code: validCode,
          code_verifier: codeVerifier,
        }).toString(),
      });
      const tokenRes = await tokenPost(tokenReq);
      assert.equal(tokenRes.status, 200);
      assert.equal(tokenRes.headers.get('access-control-allow-origin'), '*');

      const tokenData = await tokenRes.json();
      assert.ok(tokenData.access_token);
      assert.ok(tokenData.access_token.startsWith('mcn_'));
      assert.equal(tokenData.token_type, 'Bearer');
      assert.equal(tokenData.scope, 'mcnotes');

      // Verify the code cannot be reused (consumed)
      const reuseReq = new Request('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: registeredClientId,
          redirect_uri: redirectUri,
          code: validCode,
          code_verifier: codeVerifier,
        }).toString(),
      });
      const reuseRes = await tokenPost(reuseReq);
      assert.equal(reuseRes.status, 400);
      const reuseData = await reuseRes.json();
      assert.equal(reuseData.error, 'invalid_grant');

      // Verify the issued OAuth access token connects to MCP SSE stream
      const mcpRes = await mcpGet(
        new Request('http://localhost:3000/api/mcp', {
          headers: { authorization: `Bearer ${tokenData.access_token}` },
        })
      );
      assert.equal(mcpRes.status, 200);
      assert.equal(mcpRes.headers.get('content-type'), 'text/event-stream');
      const reader = mcpRes.body.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      assert.ok(text.includes('event: endpoint'));
      assert.ok(text.includes('sessionId='));
      reader.cancel();
    });
  });
});
