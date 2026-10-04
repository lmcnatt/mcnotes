import fs from 'fs';
import path from 'path';
import { getUserDir } from './notes';
export * from './linkUtils';
import {
  resolveLink,
  findLinksInMarkdown,
  computeRelativePath,
  BacklinkItem,
} from './linkUtils';

const MARKDOWN_LINK_REGEX = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Finds all backlinks to `targetPath` across all user projects.
 */
export function findBacklinks(username: string, targetPath: string): BacklinkItem[] {
  const userDir = getUserDir(username);
  const backlinks: BacklinkItem[] = [];
  const normalizedTarget = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');

  function scanDir(currentDir: string = '') {
    const dirPath = path.join(userDir, currentDir);
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = currentDir ? path.posix.join(currentDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        scanDir(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullFilePath = path.join(userDir, relPath);
        const content = fs.readFileSync(fullFilePath, 'utf8');
        const links = findLinksInMarkdown(content);

        for (const link of links) {
          const resolved = resolveLink(relPath, link.rawHref);
          if (resolved.isValid && !resolved.isExternal && resolved.targetFullPath === normalizedTarget) {
            // Find note title
            const firstH1 = content.split('\n').find((l) => l.startsWith('# '));
            const sourceTitle = firstH1 ? firstH1.substring(2).trim() : entry.name.replace('.md', '');

            // Extract context snippet around link
            const start = Math.max(0, link.index - 40);
            const end = Math.min(content.length, link.index + link.fullMatch.length + 40);
            let snippet = content.substring(start, end).replace(/\n+/g, ' ').trim();
            if (start > 0) snippet = `...${snippet}`;
            if (end < content.length) snippet = `${snippet}...`;

            backlinks.push({
              sourcePath: relPath,
              sourceTitle,
              contextSnippet: snippet,
              line: link.line,
              linkText: link.linkText,
              rawHref: link.rawHref,
              isEmbed: link.isEmbed,
            });
          }
        }
      }
    }
  }

  scanDir();
  return backlinks;
}

/**
 * Checks how many incoming links point to `targetPath` (note or folder).
 */
export function checkIncomingLinks(username: string, targetPath: string): { count: number; notes: string[] } {
  const userDir = getUserDir(username);
  const normalizedTarget = targetPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const isTargetFolder = !normalizedTarget.endsWith('.md');
  const targetFolderPrefix = isTargetFolder ? `${normalizedTarget}/` : '';

  const notesWithLinks = new Set<string>();
  let count = 0;

  function scanDir(currentDir: string = '') {
    const dirPath = path.join(userDir, currentDir);
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = currentDir ? path.posix.join(currentDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        scanDir(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Skip links within the target itself when checking incoming
        if (relPath === normalizedTarget || (isTargetFolder && relPath.startsWith(targetFolderPrefix))) {
          continue;
        }

        const fullFilePath = path.join(userDir, relPath);
        const content = fs.readFileSync(fullFilePath, 'utf8');
        const links = findLinksInMarkdown(content);

        for (const link of links) {
          const resolved = resolveLink(relPath, link.rawHref);
          if (resolved.isValid && !resolved.isExternal) {
            const pointsToTarget =
              resolved.targetFullPath === normalizedOld(normalizedTarget) ||
              resolved.targetFullPath === normalizedTarget ||
              (isTargetFolder && resolved.targetFullPath.startsWith(targetFolderPrefix));

            if (pointsToTarget) {
              count++;
              notesWithLinks.add(relPath);
            }
          }
        }
      }
    }
  }

  function normalizedOld(p: string) {
    return p;
  }

  scanDir();
  return { count, notes: Array.from(notesWithLinks) };
}

export interface LinkRenameCheckResult {
  linkCount: number;
  noteCount: number;
}

/**
 * Counts how many links will change if `oldPath` is moved/renamed to `newPath`.
 */
export function checkRenameLinks(
  username: string,
  oldPath: string,
  newPath: string
): LinkRenameCheckResult {
  const userDir = getUserDir(username);
  const normalizedOld = oldPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const isFolder = !normalizedOld.endsWith('.md');
  const oldPrefix = isFolder ? `${normalizedOld}/` : '';

  let linkCount = 0;
  const affectedNotes = new Set<string>();

  function scanDir(currentDir: string = '') {
    const dirPath = path.join(userDir, currentDir);
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = currentDir ? path.posix.join(currentDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        scanDir(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullFilePath = path.join(userDir, relPath);
        const content = fs.readFileSync(fullFilePath, 'utf8');
        const links = findLinksInMarkdown(content);

        const isInsideMoved = relPath === normalizedOld || (isFolder && relPath.startsWith(oldPrefix));
        const dirChanged = path.posix.dirname(oldPath) !== path.posix.dirname(newPath);

        for (const link of links) {
          const resolved = resolveLink(relPath, link.rawHref);
          if (!resolved.isValid || resolved.isExternal) continue;

          // Check if link points to the moved item
          const pointsToMoved =
            resolved.targetFullPath === normalizedOld ||
            (isFolder && resolved.targetFullPath.startsWith(oldPrefix));

          if (pointsToMoved) {
            linkCount++;
            affectedNotes.add(relPath);
          } else if (isInsideMoved && dirChanged && !resolved.isAnchorOnly) {
            // Link inside the moved note pointing to an external note changes relative path
            linkCount++;
            affectedNotes.add(relPath);
          }
        }
      }
    }
  }

  scanDir();
  return { linkCount, noteCount: affectedNotes.size };
}

/**
 * Rewrites all links pointing to or inside `oldPath` when moved/renamed to `newPath`.
 */
export function rewriteLinksOnMove(
  username: string,
  oldPath: string,
  newPath: string
): { updatedNotesCount: number; updatedLinksCount: number } {
  const userDir = getUserDir(username);
  const normalizedOld = oldPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const normalizedNew = newPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const isFolder = !normalizedOld.endsWith('.md');
  const oldPrefix = isFolder ? `${normalizedOld}/` : '';
  const newPrefix = isFolder ? `${normalizedNew}/` : '';

  let updatedNotesCount = 0;
  let updatedLinksCount = 0;

  function scanDir(currentDir: string = '') {
    const dirPath = path.join(userDir, currentDir);
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = currentDir ? path.posix.join(currentDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        scanDir(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullFilePath = path.join(userDir, relPath);
        const originalContent = fs.readFileSync(fullFilePath, 'utf8');

        // Check if this note itself was moved
        const isNoteMoved = relPath === normalizedOld || (isFolder && relPath.startsWith(oldPrefix));
        // Compute what this note's path is (or will be) after move
        const postMovePath = isNoteMoved
          ? isFolder
            ? relPath.replace(oldPrefix, newPrefix)
            : normalizedNew
          : relPath;

        let noteModified = false;

        const newContent = originalContent.replace(MARKDOWN_LINK_REGEX, (full, isEmbed, text, href) => {
          const resolved = resolveLink(relPath, href);
          if (!resolved.isValid || resolved.isExternal) {
            return full;
          }

          // Same-note anchor without path stays unchanged
          if (resolved.isAnchorOnly) {
            return full;
          }

          // Determine target path after the move
          let postMoveTarget = resolved.targetFullPath;
          if (resolved.targetFullPath === normalizedOld) {
            postMoveTarget = normalizedNew;
          } else if (isFolder && resolved.targetFullPath.startsWith(oldPrefix)) {
            postMoveTarget = resolved.targetFullPath.replace(oldPrefix, newPrefix);
          }

          // Compute new relative path from postMovePath to postMoveTarget
          const newRel = computeRelativePath(postMovePath, postMoveTarget);
          const newHref = resolved.anchor ? `${newRel}#${resolved.anchor}` : newRel;

          if (newHref !== href) {
            noteModified = true;
            updatedLinksCount++;
            return `${isEmbed}[${text}](${newHref})`;
          }
          return full;
        });

        if (noteModified) {
          fs.writeFileSync(fullFilePath, newContent, 'utf8');
          updatedNotesCount++;
        }
      }
    }
  }

  scanDir();
  return { updatedNotesCount, updatedLinksCount };
}

/**
 * Returns a flat list of all notes and folders for the user across all projects.
 */
export function getAllNotesAndFolders(username: string): {
  path: string;
  name: string;
  title: string;
  isDirectory: boolean;
  project: string;
}[] {
  const userDir = getUserDir(username);
  const items: {
    path: string;
    name: string;
    title: string;
    isDirectory: boolean;
    project: string;
  }[] = [];

  function scanDir(currentDir: string = '', project: string = '') {
    const dirPath = path.join(userDir, currentDir);
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = currentDir ? path.posix.join(currentDir, entry.name) : entry.name;
      const currentProject = project || entry.name;

      if (entry.isDirectory()) {
        items.push({
          path: `${relPath}/`,
          name: entry.name,
          title: entry.name,
          isDirectory: true,
          project: currentProject,
        });
        scanDir(relPath, currentProject);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        let title = entry.name.replace('.md', '');
        try {
          const fullPath = path.join(userDir, relPath);
          const firstLine = fs.readFileSync(fullPath, 'utf8').split('\n')[0] || '';
          if (firstLine.startsWith('# ')) {
            title = firstLine.substring(2).trim();
          }
        } catch {
          // ignore
        }
        items.push({
          path: relPath,
          name: entry.name,
          title,
          isDirectory: false,
          project: currentProject,
        });
      }
    }
  }

  scanDir();
  return items;
}
