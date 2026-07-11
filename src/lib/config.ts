import path from 'path';

/**
 * Central, environment-driven configuration for McNotes.
 *
 * All runtime data (SQLite database + per-user markdown files) lives under a
 * single directory so the app can be run bare-metal or in a container by
 * mounting one volume.
 *
 * NOTE: This module uses the Node.js `path` API and must only be imported from
 * server-side (Node runtime) code. Do NOT import it from the Edge middleware or
 * from `src/lib/auth.ts`, which run in the Edge runtime.
 */

function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  // Sensible default for local development: a `data/` folder in the project root.
  // Containers set DATA_DIR=/data explicitly (see Dockerfile).
  return path.join(process.cwd(), 'data');
}

export const DATA_DIR = resolveDataDir();

/** Path to the SQLite database file (users + instance metadata). */
export const DB_PATH = path.join(DATA_DIR, 'users.db');

/** Root directory that holds every user's markdown files. */
export const USERS_DIR = path.join(DATA_DIR, 'users');

/** HTTP port the server listens on. */
export const PORT = Number.parseInt(process.env.PORT ?? '3010', 10);

/**
 * Whether public self-registration is enabled by default when the instance is
 * first initialized. Admins can toggle this at runtime; this only seeds the
 * initial value. Defaults to disabled (closed) for a safer self-hosted default.
 */
export const ALLOW_REGISTRATION_DEFAULT = process.env.ALLOW_REGISTRATION === 'true';
