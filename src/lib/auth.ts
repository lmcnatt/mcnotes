import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

// This module runs in both the Node and Edge (middleware) runtimes, so it must
// only rely on `process.env` — never the Node `fs`/`path` APIs.
const INSECURE_DEFAULT = 'mcnatt-notes-super-secret-key-change-me';

let cachedKey: Uint8Array | null = null;

/**
 * Resolve (and memoize) the signing key. The strict production check is done
 * lazily — never at module load — so that `next build` (which evaluates route
 * modules to collect page data) does not fail before the runtime secret is
 * injected by the container entrypoint.
 */
function getSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.JWT_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (
    !isBuildPhase &&
    process.env.NODE_ENV === 'production' &&
    (!secret || secret === INSECURE_DEFAULT)
  ) {
    throw new Error(
      'JWT_SECRET must be set to a strong, unique value in production. ' +
        'Set the JWT_SECRET environment variable (the container entrypoint can generate one automatically).'
    );
  }

  if (!secret) {
    console.warn(
      '[auth] JWT_SECRET is not set — using an insecure development fallback. Do NOT use this in production.'
    );
  }

  cachedKey = new TextEncoder().encode(secret || 'dev-only-insecure-secret');
  return cachedKey;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signJWT(payload: { username: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // 30 days session
    .sign(getSecretKey());
}

export async function verifyJWT(token: string): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as { username: string };
  } catch (e) {
    return null;
  }
}

