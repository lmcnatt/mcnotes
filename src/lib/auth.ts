import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

// This module runs in both the Node and Edge (middleware) runtimes, so it must
// only rely on `process.env` — never the Node `fs`/`path` APIs.
const JWT_SECRET = process.env.JWT_SECRET;
const INSECURE_DEFAULT = 'mcnatt-notes-super-secret-key-change-me';

if (process.env.NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET === INSECURE_DEFAULT)) {
  throw new Error(
    'JWT_SECRET must be set to a strong, unique value in production. ' +
      'Set the JWT_SECRET environment variable (the container entrypoint can generate one automatically).'
  );
}

if (!JWT_SECRET) {
  console.warn(
    '[auth] JWT_SECRET is not set — using an insecure development fallback. Do NOT use this in production.'
  );
}

const encoder = new TextEncoder();
const secretKey = encoder.encode(JWT_SECRET || 'dev-only-insecure-secret');

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
    .sign(secretKey);
}

export async function verifyJWT(token: string): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as { username: string };
  } catch (e) {
    return null;
  }
}
