import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'mcnatt-notes-super-secret-key-change-me';
const encoder = new TextEncoder();
const secretKey = encoder.encode(JWT_SECRET);

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
