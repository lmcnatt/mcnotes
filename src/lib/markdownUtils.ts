/**
 * Client-safe markdown preprocessing and utility functions.
 * Preserves line counts so source-line mapping (e.g. data-source-line, checkbox toggling)
 * remains accurate.
 */

// Matches a list line: leading whitespace, bullet marker (- * + or \d+[.)]),
// optional delimiter for numbers, whitespace, optional checkbox [ ]/[x], and the rest of the text.
const LIST_REGEX = /^(\s*)([-*+]|\d+[.)])(\s+)(?:(\[[ xX]\])\s+)?(.*)$/;

interface StackEntry {
  rawIndent: number;
  level: number;
}

/**
 * Normalizes list indentation so that sub-lists indented by 2 spaces (common in editors)
 * are properly recognized as nested lists by CommonMark / remark parser.
 * CommonMark requires ordered sublists under e.g. "1. " to be indented by >= 3-4 spaces.
 * This maps nesting levels to 4 spaces per level while strictly preserving line count.
 */
export function normalizeListIndentation(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  const result: string[] = [];

  let stack: StackEntry[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check code fence (``` or ~~~)
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      stack = [];
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Preserve blank lines without clearing list hierarchy immediately
    if (line.trim() === '') {
      result.push(line);
      continue;
    }

    // Support blockquote prefix if present
    const bqMatch = line.match(/^([ \t]*(?:>[ \t]*)+)(.*)$/);
    const bqPrefix = bqMatch ? bqMatch[1] : '';
    const content = bqMatch ? bqMatch[2] : line;

    const listMatch = content.match(LIST_REGEX);

    if (listMatch) {
      const rawIndent = listMatch[1].replace(/\t/g, '  ').length;
      const marker = listMatch[2];
      const spacesAfterMarker = listMatch[3];
      const checkbox = listMatch[4];
      const rest = listMatch[5];

      // Pop deeper entries
      while (stack.length > 0 && rawIndent < stack[stack.length - 1].rawIndent) {
        stack.pop();
      }

      let currentLevel = 0;
      if (stack.length === 0) {
        currentLevel = 0;
        stack.push({ rawIndent, level: 0 });
      } else if (rawIndent === stack[stack.length - 1].rawIndent) {
        currentLevel = stack[stack.length - 1].level;
      } else {
        // rawIndent > stack top
        currentLevel = stack[stack.length - 1].level + 1;
        stack.push({ rawIndent, level: currentLevel });
      }

      const newIndent = ' '.repeat(currentLevel * 4);
      const cbPart = checkbox ? `${checkbox} ` : '';
      result.push(`${bqPrefix}${newIndent}${marker}${spacesAfterMarker}${cbPart}${rest}`);
    } else {
      // Non-list line
      const rawIndent = content.match(/^\s*/)?.[0].replace(/\t/g, '  ').length || 0;
      if (stack.length > 0 && rawIndent >= stack[stack.length - 1].rawIndent && stack[stack.length - 1].rawIndent > 0) {
        // Continuation line of an indented list item
        const top = stack[stack.length - 1];
        const extra = rawIndent - top.rawIndent;
        const newIndent = ' '.repeat(top.level * 4 + extra);
        result.push(`${bqPrefix}${newIndent}${content.trimStart()}`);
      } else {
        // Line breaks the active list
        stack = [];
        result.push(line);
      }
    }
  }

  return result.join('\n');
}

/**
 * Preprocesses markdown for preview rendering:
 * 1. Normalizes list indentation so 2-space indented numbered and bullet lists nest properly.
 * 2. Preprocesses underline syntax (++text++ and <u>text</u>).
 * Preserves exact line count so source-line mapping remains accurate.
 */
export function preprocessMarkdown(text: string): string {
  if (!text) return text;
  const normalized = normalizeListIndentation(text);
  return normalized
    .replace(/<u>([\s\S]*?)<\/u>/gi, '[$1](#u)')
    .replace(/\+\+([\s\S]*?)\+\+/g, '[$1](#u)');
}
