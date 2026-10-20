import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiToken,
  verifyApiToken,
  listApiTokens,
  revokeApiToken,
  hashApiToken,
  createUser,
  deleteUserRecords,
} from '../db.ts';

describe('Personal Access Tokens (PAT)', () => {
  let testUser;
  const testUsername = `test_pat_user_${Date.now()}`;

  before(() => {
    testUser = createUser(testUsername, 'hashed_pw_test');
  });

  after(() => {
    if (testUser?.id) {
      deleteUserRecords(testUser.id, testUsername);
    }
  });

  it('createApiToken generates cryptographically secure token prefixed with mcn_', async () => {
    const { id, rawToken } = await createApiToken(String(testUser.id), 'Cursor IDE');
    assert.ok(id, 'Token id should be defined');
    assert.ok(rawToken.startsWith('mcn_'), 'Token should start with mcn_');
    assert.ok(rawToken.length > 20, 'Token should have high entropy');

    const expectedHash = hashApiToken(rawToken);
    assert.equal(typeof expectedHash, 'string');
    assert.equal(expectedHash.length, 64, 'SHA-256 hash length should be 64 hex chars');
  });

  it('verifyApiToken successfully verifies valid token and updates last_used_at', async () => {
    const { id, rawToken } = await createApiToken(String(testUser.id), 'Claude Desktop');
    const result = await verifyApiToken(rawToken);

    assert.ok(result, 'verifyApiToken should return a result for valid token');
    assert.equal(result.userId, String(testUser.id));
    assert.equal(result.tokenId, id);

    // Verify last_used_at was updated
    const tokens = await listApiTokens(String(testUser.id));
    const token = tokens.find((t) => t.id === id);
    assert.ok(token, 'Token should be in list');
    assert.ok(token.last_used_at, 'last_used_at should be updated');
  });

  it('verifyApiToken rejects invalid or malformed tokens', async () => {
    assert.equal(await verifyApiToken('invalid_token_here'), null);
    assert.equal(await verifyApiToken('mcn_nonexistent00000000000000000000000000000000'), null);
    assert.equal(await verifyApiToken(''), null);
    assert.equal(await verifyApiToken(null), null);
    assert.equal(await verifyApiToken(undefined), null);
  });

  it('revokeApiToken revokes token and rejects subsequent verification', async () => {
    const { id, rawToken } = await createApiToken(String(testUser.id), 'Token to Revoke');

    // Verify it works before revoking
    const beforeRevoke = await verifyApiToken(rawToken);
    assert.ok(beforeRevoke, 'Token should be valid before revoking');

    // Revoke token
    await revokeApiToken(String(testUser.id), id);

    // Verify it is rejected after revoking
    const afterRevoke = await verifyApiToken(rawToken);
    assert.equal(afterRevoke, null, 'Revoked token should return null on verification');

    // Check listApiTokens does not include revoked token
    const tokens = await listApiTokens(String(testUser.id));
    assert.ok(!tokens.some((t) => t.id === id), 'Revoked token should not be listed');
  });
});
