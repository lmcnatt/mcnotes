import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = '/mnt/mcnatt-storage/notes';
const DB_PATH = path.join(DB_DIR, 'users.db');

// Ensure DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS node_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    path TEXT NOT NULL,
    emoji TEXT NOT NULL,
    UNIQUE(username, path)
  );
`);

export interface User {
  id: number;
  username: string;
  password?: string;
  created_at: string;
}

export function getUserByUsername(username: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username);
  return (user as User) || null;
}

export function createUser(username: string, passwordHash: string): User {
  const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  const info = stmt.run(username, passwordHash);
  return {
    id: info.lastInsertRowid as number,
    username,
    created_at: new Date().toISOString()
  };
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

