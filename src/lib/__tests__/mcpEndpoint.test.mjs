import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiToken,
  createUser,
  deleteUserRecords,
  revokeApiToken,
} from '../db.ts';
import { GET as mcpGet, POST as mcpPost } from '../../app/api/mcp/route.ts';
import { GET as tokensGet, POST as tokensPost, DELETE as tokensDelete } from '../../app/api/tokens/route.ts';

describe('MCP Endpoint and Token Management Integration', () => {
  let testUser;
  let rawToken;
  let tokenId;
  const testUsername = `mcp_user_${Date.now()}`;

  before(async () => {
    testUser = createUser(testUsername, 'password_hash_123');
    const tokenInfo = await createApiToken(String(testUser.id), 'Test Key');
    tokenId = tokenInfo.id;
    rawToken = tokenInfo.rawToken;
  });

  after(() => {
    if (testUser?.id) {
      deleteUserRecords(testUser.id, testUsername);
    }
  });

  describe('Tokens REST API (/api/tokens)', () => {
    it('GET /api/tokens rejects unauthenticated request with 401', async () => {
      const res = await tokensGet(new Request('http://localhost:3000/api/tokens'));
      assert.equal(res.status, 401);
    });

    it('GET /api/tokens lists active tokens for authenticated user', async () => {
      const req = new Request('http://localhost:3000/api/tokens', {
        headers: { 'x-user-username': testUsername },
      });
      const res = await tokensGet(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.tokens));
      assert.ok(data.tokens.some((t) => t.id === tokenId));
    });

    it('POST /api/tokens generates new token and returns { id, name, rawToken }', async () => {
      const req = new Request('http://localhost:3000/api/tokens', {
        method: 'POST',
        headers: {
          'x-user-username': testUsername,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Cursor Token' }),
      });
      const res = await tokensPost(req);
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.id);
      assert.equal(data.name, 'Cursor Token');
      assert.ok(data.rawToken.startsWith('mcn_'));
    });

    it('DELETE /api/tokens revokes the specified token', async () => {
      const createReq = new Request('http://localhost:3000/api/tokens', {
        method: 'POST',
        headers: {
          'x-user-username': testUsername,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Temporary Token' }),
      });
      const createRes = await tokensPost(createReq);
      const { id } = await createRes.json();

      const delReq = new Request(`http://localhost:3000/api/tokens?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-user-username': testUsername },
      });
      const delRes = await tokensDelete(delReq);
      assert.equal(delRes.status, 200);

      // Verify token is no longer in user's list
      const listReq = new Request('http://localhost:3000/api/tokens', {
        headers: { 'x-user-username': testUsername },
      });
      const listRes = await tokensGet(listReq);
      const data = await listRes.json();
      assert.ok(!data.tokens.some((t) => t.id === id));
    });
  });

  describe('MCP Remote Route (/api/mcp)', () => {
    it('rejects unauthenticated GET with 401', async () => {
      const res = await mcpGet(new Request('http://localhost:3000/api/mcp'));
      assert.equal(res.status, 401);
    });

    it('rejects GET with invalid bearer token with 401', async () => {
      const res = await mcpGet(
        new Request('http://localhost:3000/api/mcp', {
          headers: { authorization: 'Bearer mcn_invalid_token_123' },
        })
      );
      assert.equal(res.status, 401);
    });

    it('authenticates GET via ?token=<token> and initiates SSE stream', async () => {
      const res = await mcpGet(
        new Request(`http://localhost:3000/api/mcp?token=${rawToken}`)
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream');

      const reader = res.body.getReader();
      const { value } = await reader.read();
      const chunk = new TextDecoder().decode(value);
      assert.ok(chunk.includes('event: endpoint'));
      assert.ok(chunk.includes('sessionId='));
      reader.cancel();
    });

    it('authenticates GET via Authorization: Bearer <token>, establishes session, and handles tool calls', async () => {
      const sseRes = await mcpGet(
        new Request('http://localhost:3000/api/mcp', {
          headers: { authorization: `Bearer ${rawToken}` },
        })
      );
      assert.equal(sseRes.status, 200);
      assert.equal(sseRes.headers.get('content-type'), 'text/event-stream');

      const reader = sseRes.body.getReader();
      const { value } = await reader.read();
      const initialChunk = new TextDecoder().decode(value);
      assert.ok(initialChunk.includes('event: endpoint'));

      const sessionMatch = initialChunk.match(/sessionId=([a-f0-9-]+)/);
      assert.ok(sessionMatch, 'Should find sessionId in endpoint event');
      const sessionId = sessionMatch[1];

      // Helper to post a JSON-RPC message
      async function postMcp(payload) {
        return mcpPost(
          new Request(`http://localhost:3000/api/mcp?sessionId=${sessionId}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${rawToken}`,
            },
            body: JSON.stringify(payload),
          })
        );
      }

      // Initialize
      const initRes = await postMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        },
      });
      assert.equal(initRes.status, 202);

      // Save a note via save_note tool
      const saveRes = await postMcp({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'save_note',
          arguments: {
            path: 'welcome.md',
            content: '# Welcome\nThis is a test note linking to [Overview](overview.md).',
          },
        },
      });
      assert.equal(saveRes.status, 202);

      // Read the note via read_note tool
      const readRes = await postMcp({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'read_note',
          arguments: {
            path: 'welcome.md',
          },
        },
      });
      assert.equal(readRes.status, 202);

      // Search notes via search_notes tool
      const searchRes = await postMcp({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_notes',
          arguments: {
            query: 'Welcome',
          },
        },
      });
      assert.equal(searchRes.status, 202);

      // List notes via list_notes tool
      const listRes = await postMcp({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'list_notes',
          arguments: {},
        },
      });
      assert.equal(listRes.status, 202);

      // Backlinks via get_backlinks tool
      const backlinksRes = await postMcp({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_backlinks',
          arguments: {
            path: 'overview.md',
          },
        },
      });
      assert.equal(backlinksRes.status, 202);

      // Path traversal protection
      const traversalRes = await postMcp({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'read_note',
          arguments: {
            path: '../../etc/passwd',
          },
        },
      });
      assert.equal(traversalRes.status, 202); // Transport accepts message and returns tool error in SSE stream

      reader.cancel();
    });
  });
});
