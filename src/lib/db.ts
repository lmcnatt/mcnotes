import Database from 'better-sqlite3';
import fs from 'fs';
import { DATA_DIR, DB_PATH, ALLOW_REGISTRATION_DEFAULT } from './config';

// Ensure the data directory exists before opening the database.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS node_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    path TEXT NOT NULL,
    emoji TEXT NOT NULL,
    UNIQUE(username, path)
  );

  CREATE TABLE IF NOT EXISTS instance_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Lightweight migration: add is_admin to pre-existing databases.
const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userColumns.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

// Seed the initial registration setting once, from the environment default.
const seedRegistration = db.prepare(
  'INSERT OR IGNORE INTO instance_settings (key, value) VALUES (?, ?)'
);
seedRegistration.run('allow_registration', ALLOW_REGISTRATION_DEFAULT ? '1' : '0');

export interface User {
  id: number;
  username: string;
  password?: string;
  is_admin: number;
  created_at: string;
}

export function getUserByUsername(username: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username);
  return (user as User) || null;
}

export function getUserCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count;
}

export function createUser(username: string, passwordHash: string, isAdmin = false): User {
  const stmt = db.prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)');
  const info = stmt.run(username, passwordHash, isAdmin ? 1 : 0);
  return {
    id: info.lastInsertRowid as number,
    username,
    is_admin: isAdmin ? 1 : 0,
    created_at: new Date().toISOString()
  };
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM instance_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO instance_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function isRegistrationAllowed(): boolean {
  // The very first account may always be created; it becomes the admin.
  if (getUserCount() === 0) return true;
  return getSetting('allow_registration') === '1';
}

export function setNodeEmoji(username: string, path: string, emoji: string): void {
  if (!emoji) {
    const stmt = db.prepare('DELETE FROM node_metadata WHERE username = ? AND path = ?');
    stmt.run(username, path);
  } else {
    const stmt = db.prepare(`
      INSERT INTO node_metadata (username, path, emoji)
      VALUES (?, ?, ?)
      ON CONFLICT(username, path) DO UPDATE SET emoji = excluded.emoji
    `);
    stmt.run(username, path, emoji);
  }
}

export function getAllNodeMetadata(username: string): Record<string, { emoji: string }> {
  const stmt = db.prepare('SELECT path, emoji FROM node_metadata WHERE username = ?');
  const rows = stmt.all(username) as { path: string; emoji: string }[];
  const metadata: Record<string, { emoji: string }> = {};
  for (const row of rows) {
    metadata[row.path] = { emoji: row.emoji };
  }
  return metadata;
}

export function updateMetadataPaths(username: string, oldPath: string, newPath: string): void {
  const stmt1 = db.prepare('UPDATE node_metadata SET path = ? WHERE username = ? AND path = ?');
  stmt1.run(newPath, username, oldPath);

  const stmt2 = db.prepare(`
    UPDATE node_metadata 
    SET path = ? || substr(path, length(?) + 1)
    WHERE username = ? AND path LIKE ?
  `);
  stmt2.run(newPath, oldPath, username, oldPath + '/%');
}

export function deleteNodeMetadata(username: string, path: string): void {
  const stmt1 = db.prepare('DELETE FROM node_metadata WHERE username = ? AND path = ?');
  stmt1.run(username, path);

  const stmt2 = db.prepare('DELETE FROM node_metadata WHERE username = ? AND path LIKE ?');
  stmt2.run(username, path + '/%');
}

export default db;

