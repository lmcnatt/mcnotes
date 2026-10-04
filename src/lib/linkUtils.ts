/**
 * Pure client-safe path and markdown link utilities.
 * Does not import Node.js 'fs' or 'path' modules.
 */

export function posixNormalize(p: string): string {
  if (!p) return '.';
  const isAbs = p.startsWith('/');
  const trailingSlash = p.endsWith('/') && p !== '/';
  const segments = p.split('/');
  const stack: string[] = [];

  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbs) {
        stack.push('..');
      }
    } else {
      stack.push(seg);
    }
  }

  let res = (isAbs ? '/' : '') + stack.join('/');
  if (!res) res = isAbs ? '/' : '.';
  if (trailingSlash && !res.endsWith('/')) res += '/';
  return res;
}

export function posixDirname(p: string): string {
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return normalized.substring(0, lastSlash);
}

export function posixJoin(...parts: string[]): string {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return '.';
  return posixNormalize(filtered.join('/'));
}

export function posixRelative(from: string, to: string): string {
  const normFrom = posixNormalize(from).replace(/^\/+/, '');
  const normTo = posixNormalize(to).replace(/^\/+/, '');

  if (normFrom === normTo) return '';

  const fromParts = normFrom === '.' || normFrom === '' ? [] : normFrom.split('/');
  const toParts = normTo === '.' || normTo === '' ? [] : normTo.split('/');

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }

  const up = fromParts.slice(common).map(() => '..');
  const down = toParts.slice(common);

  const result = [...up, ...down].join('/');
  return result || '.';
}

/**
 * GitHub-style heading slug generation.
 * Lowercase, strip punctuation, spaces and underscores to hyphens, trimmed.
 */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '') // strip html tags
    .replace(/[^\w\s-]/g, '') // strip punctuation
    .replace(/[\s_-]+/g, '-') // spaces & underscores to -
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

/**
 * Creates a slugifier that deduplicates repeated headings in the same document (-1, -2, etc.).
 */
export function createSlugger() {
  const occurrences = new Map<string, number>();

  return function slugify(text: string): string {
    const raw = githubSlug(text) || 'section';
    const count = occurrences.get(raw) || 0;
    occurrences.set(raw, count + 1);
    if (count === 0) {
      return raw;
    }
    return `${raw}-${count}`;
  };
}

/**
 * Computes a relative markdown link path from `fromNotePath` to `toTargetPath`.
 * Both paths are relative to the user root (e.g. "Project/Folder/Note.md").
 */
export function computeRelativePath(fromNotePath: string, toTargetPath: string): string {
  const fromDir = posixDirname(fromNotePath);
  const isFolder = toTargetPath.endsWith('/');
  const normalizedTarget = toTargetPath.endsWith('/') ? toTargetPath.slice(0, -1) : toTargetPath;

  let rel = posixRelative(fromDir, normalizedTarget);
  if (!rel) {
    rel = '.';
  }

  // Preserve trailing slash for folder links
  if (isFolder && !rel.endsWith('/')) {
    rel = `${rel}/`;
  }

  // Percent-encode special characters like spaces for markdown link portability
  const parts = rel.split('/');
  const encodedParts = parts.map(encodeURIComponent);
  return encodedParts.join('/');
}

export interface ResolvedLink {
  targetFullPath: string; // Relative to user root, e.g. "Project/Folder/Note.md" or "Project/Folder/"
  anchor?: string; // e.g. "heading-slug" or "^blockid"
  isFolder: boolean;
  isExternal: boolean;
  isAnchorOnly: boolean;
  isValid: boolean;
}

/**
 * Resolves a raw markdown link target relative to `fromNotePath`.
 */
export function resolveLink(fromNotePath: string, rawHref: string): ResolvedLink {
  if (!rawHref) {
    return {
      targetFullPath: '',
      isFolder: false,
      isExternal: false,
      isAnchorOnly: false,
      isValid: false,
    };
  }

  // External URLs
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawHref)) {
    return {
      targetFullPath: rawHref,
      isFolder: false,
      isExternal: true,
      isAnchorOnly: false,
      isValid: true,
    };
  }

  // Same-note anchor
  if (rawHref.startsWith('#')) {
    return {
      targetFullPath: fromNotePath,
      anchor: decodeURIComponent(rawHref.slice(1)),
      isFolder: false,
      isExternal: false,
      isAnchorOnly: true,
      isValid: true,
    };
  }

  // Separate path and hash anchor
  const hashIdx = rawHref.indexOf('#');
  const rawPath = hashIdx !== -1 ? rawHref.substring(0, hashIdx) : rawHref;
  const rawAnchor = hashIdx !== -1 ? decodeURIComponent(rawHref.substring(hashIdx + 1)) : undefined;

  const isFolder = rawPath.endsWith('/');
  const decodedPath = decodeURI(rawPath);

  const fromDir = posixDirname(fromNotePath);
  const combined = posixJoin(fromDir, decodedPath);
  const normalized = posixNormalize(combined);

  // Traversal protection: cannot start with '..' or escape user directory
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    return {
      targetFullPath: '',
      anchor: rawAnchor,
      isFolder,
      isExternal: false,
      isAnchorOnly: false,
      isValid: false,
    };
  }

  const targetFullPath = isFolder && !normalized.endsWith('/') ? `${normalized}/` : normalized;

  return {
    targetFullPath,
    anchor: rawAnchor,
    isFolder,
    isExternal: false,
    isAnchorOnly: false,
    isValid: true,
  };
}

export interface MarkdownHeading {
  text: string;
  slug: string;
  level: number;
  line: number;
}

export interface MarkdownParagraph {
  text: string;
  line: number;
  existingId?: string;
}

/**
 * Extracts headings and paragraphs with block IDs from markdown text.
 */
export function extractHeadingsAndParagraphs(content: string): {
  headings: MarkdownHeading[];
  paragraphs: MarkdownParagraph[];
} {
  const lines = content.split('\n');
  const headings: MarkdownHeading[] = [];
  const paragraphs: MarkdownParagraph[] = [];
  const slugger = createSlugger();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const slug = slugger(text);
      headings.push({ text, slug, level, line: i + 1 });
      continue;
    }

    // Paragraph / block
    if (line.trim() !== '' && !line.startsWith('```') && !line.startsWith('---')) {
      const blockIdMatch = line.match(/\s+\^([a-zA-Z0-9_-]+)$/);
      let text = line.trim();
      let existingId: string | undefined;
      if (blockIdMatch) {
        existingId = blockIdMatch[1];
        text = text.substring(0, text.length - blockIdMatch[0].length).trim();
      }
      if (text.length > 0) {
        paragraphs.push({
          text,
          line: i + 1,
          existingId,
        });
      }
    }
  }

  return { headings, paragraphs };
}

export interface NoteLinkMatch {
  fullMatch: string;
  isEmbed: boolean;
  linkText: string;
  rawHref: string;
  text: string;
  href: string;
  index: number;
  line: number;
  column: number;
}

// Regex matching markdown links [text](url) and embeds ![text](url)
const MARKDOWN_LINK_REGEX = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Finds all markdown links and embeds in the given text.
 */
export function findLinksInMarkdown(content: string): NoteLinkMatch[] {
  const matches: NoteLinkMatch[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let match: RegExpExecArray | null;
    const regex = new RegExp(MARKDOWN_LINK_REGEX.source, 'g');

    while ((match = regex.exec(line)) !== null) {
      matches.push({
        fullMatch: match[0],
        isEmbed: match[1] === '!',
        linkText: match[2],
        rawHref: match[3].trim(),
        text: match[2],
        href: match[3].trim(),
        index: currentOffset + match.index,
        line: lineIdx + 1,
        column: match.index + 1,
      });
    }

    currentOffset += line.length + 1; // +1 for '\n'
  }

  return matches;
}

export interface BacklinkItem {
  sourcePath: string; // User-relative path of note containing link
  sourceTitle: string;
  title?: string;
  isEmbed: boolean;
  linkText: string;
  rawHref: string;
  contextSnippet: string;
  snippet?: string;
  anchor?: string;
  line: number;
}
