import fs from 'fs';
import path from 'path';
import { DATA_DIR, USERS_DIR } from './config';

export interface UserFolderStats {
  noteCount: number;
  storageBytes: number;
}

/** Recursively counts `.md` files and total bytes in a user's folder (never creates it). */
export function getUserFolderStats(username: string): UserFolderStats {
  const root = path.join(USERS_DIR, username);
  const stats: UserFolderStats = { noteCount: 0, storageBytes: 0 };
  if (!fs.existsSync(root)) return stats;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          stats.storageBytes += fs.statSync(full).size;
        } catch {
          /* ignore unreadable files */
        }
        if (entry.name.toLowerCase().endsWith('.md')) stats.noteCount += 1;
      }
    }
  };
  walk(root);
  return stats;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * Moves a user's folder to DATA_DIR/archived-users/<username>-<timestamp>/.
 * Returns the archive path, or null if the user had no folder.
 */
export function archiveUserFolder(username: string): { from: string; to: string } | null {
  const from = path.join(USERS_DIR, username);
  if (!fs.existsSync(from)) return null;

  const archiveRoot = path.join(DATA_DIR, 'archived-users');
  fs.mkdirSync(archiveRoot, { recursive: true });
  const to = path.join(archiveRoot, `${username}-${timestamp()}`);

  try {
    fs.renameSync(from, to);
  } catch {
    // Likely a cross-device move: fall back to copy + remove.
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
  return { from, to };
}

/** Best-effort restore of an archived folder to its original location. */
export function restoreArchivedFolder(archive: { from: string; to: string }): void {
  try {
    fs.renameSync(archive.to, archive.from);
  } catch {
    fs.cpSync(archive.to, archive.from, { recursive: true });
    fs.rmSync(archive.to, { recursive: true, force: true });
  }
}
