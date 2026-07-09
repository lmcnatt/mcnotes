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

export default db;
