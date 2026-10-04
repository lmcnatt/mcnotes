/**
 * Editor indentation and list renumbering logic for McNotes.
 * Implements Obsidian/Typora-style list handling and Tab / Shift+Tab behavior.
 */

export interface IndentResult {
  newContent: string;
  selStart: number;
  selEnd: number;
}

// Matches: leading whitespace, bullet marker (- * + or \d+[.)]), delimiter for numbers,
// optional trailing space, optional checkbox, rest of text.
const LIST_LINE_REGEX = /^(\s*)([-*+]|\d+([.)]))(\s+)(?:(\[[ xX]\])\s+)?(.*)$/;

export function isListLine(line: string): boolean {
  return LIST_LINE_REGEX.test(line);
}

interface ListStackEntry {
  indent: number;
  counter: number;
  delimiter: string;
  isNumbered: boolean;
}

/**
 * Renumbers any contiguous numbered list blocks in the given array of lines.
 */
export function renumberLists(lines: string[]): string[] {
  const result = [...lines];
  const stack: ListStackEntry[] = [];

  for (let i = 0; i < result.length; i++) {
    const line = result[i];

    // Blank line: does not immediately break if following lines are still part of list,
    // but if empty, continue without popping immediately unless next line is non-list
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(LIST_LINE_REGEX);
    if (!match) {
      // Non-list line breaks the active list
      stack.length = 0;
      continue;
    }

    const leadingSpaces = match[1];
    const numDelim = match[3]; // '.' or ')'
    const spacesAfterMarker = match[4];
    const checkbox = match[5]; // e.g. '[ ]' or '[x]'
    const rest = match[6];
    const currentIndent = leadingSpaces.length;
    const isNumbered = Boolean(numDelim);

    // Pop any stack entries deeper than current indent
    while (stack.length > 0 && stack[stack.length - 1].indent > currentIndent) {
      stack.pop();
    }

    if (stack.length > 0 && stack[stack.length - 1].indent === currentIndent) {
      const top = stack[stack.length - 1];
      if (isNumbered) {
        if (top.isNumbered) {
          top.counter += 1;
          const delim = top.delimiter || numDelim;
          const cbPart = checkbox ? `${checkbox} ` : '';
          result[i] = `${leadingSpaces}${top.counter}${delim}${spacesAfterMarker}${cbPart}${rest}`;
        } else {
          // Switch from bullet to numbered at same indent
          top.isNumbered = true;
          top.counter = 1;
          top.delimiter = numDelim;
          const cbPart = checkbox ? `${checkbox} ` : '';
          result[i] = `${leadingSpaces}1${numDelim}${spacesAfterMarker}${cbPart}${rest}`;
        }
      } else {
        // Bullet item at this level
        top.isNumbered = false;
        top.counter = 0;
      }
    } else {
      // Start of a new level (either at root or sublist)
      let inheritedDelim = numDelim;
      if (stack.length > 0 && stack[stack.length - 1].isNumbered) {
        // Inherit delimiter from parent if desired, or keep current
        inheritedDelim = numDelim || stack[stack.length - 1].delimiter;
      }
      stack.push({
        indent: currentIndent,
        counter: 1,
        delimiter: inheritedDelim,
        isNumbered,
      });

      if (isNumbered) {
        const delim = inheritedDelim || '.';
        const cbPart = checkbox ? `${checkbox} ` : '';
        result[i] = `${leadingSpaces}1${delim}${spacesAfterMarker}${cbPart}${rest}`;
      }
    }
  }

  return result;
}

/**
 * Handles Tab or Shift+Tab key press in the editor.
 */
export function handleTabIndent(
  content: string,
  start: number,
  end: number,
  isShift: boolean
): IndentResult {
  const lineStartIndex = content.lastIndexOf('\n', start - 1) + 1;
  const endPos = end > start && content[end - 1] === '\n' ? end - 1 : end;
  let lineEndIndex = content.indexOf('\n', endPos);
  if (lineEndIndex === -1) lineEndIndex = content.length;

  const isMultiLine = content.substring(lineStartIndex, lineEndIndex).includes('\n');
  const allLines = content.split('\n');

  // Find line indexes in allLines
  let currentPos = 0;
  let startLineIdx = 0;
  let endLineIdx = 0;

  for (let i = 0; i < allLines.length; i++) {
    const nextPos = currentPos + allLines[i].length;
    if (currentPos <= lineStartIndex && lineStartIndex <= nextPos) {
      startLineIdx = i;
    }
    if (currentPos <= lineEndIndex && lineEndIndex <= nextPos) {
      endLineIdx = i;
    }
    currentPos = nextPos + 1; // +1 for '\n'
  }

  // Case 1: Cursor with no selection (start === end)
  if (start === end) {
    const singleLine = allLines[startLineIdx];
    const isList = isListLine(singleLine);
    const cursorCol = start - lineStartIndex;

    if (!isList) {
      // Non-list line
      if (!isShift) {
        // Tab: Insert 2 spaces at the cursor
        const newContent = content.slice(0, start) + '  ' + content.slice(start);
        return {
          newContent,
          selStart: start + 2,
          selEnd: start + 2,
        };
      } else {
        // Shift+Tab: Outdent the line by up to 2 spaces
        const match = singleLine.match(/^ {1,2}/);
        const removed = match ? match[0].length : 0;
        if (removed === 0) {
          return { newContent: content, selStart: start, selEnd: end };
        }
        allLines[startLineIdx] = singleLine.slice(removed);
        const newContent = allLines.join('\n');
        const newCol = Math.max(0, cursorCol - removed);
        const newPos = lineStartIndex + newCol;
        return {
          newContent,
          selStart: newPos,
          selEnd: newPos,
        };
      }
    } else {
      // List line
      if (!isShift) {
        // Tab: Indent line by 2 spaces
        allLines[startLineIdx] = '  ' + singleLine;
      } else {
        // Shift+Tab: Outdent line by up to 2 spaces
        allLines[startLineIdx] = singleLine.replace(/^ {1,2}/, '');
      }

      // Renumber numbered lists
      const renumbered = renumberLists(allLines);
      const newContent = renumbered.join('\n');

      // Calculate new cursor position preserving position relative to text
      const oldLine = singleLine;
      const newLine = renumbered[startLineIdx];
      const oldLeading = oldLine.match(/^\s*/)?.[0].length || 0;
      const newLeading = newLine.match(/^\s*/)?.[0].length || 0;

      // Extract marker info
      const oldMarkerMatch = oldLine.match(LIST_LINE_REGEX);
      const newMarkerMatch = newLine.match(LIST_LINE_REGEX);

      let delta = newLeading - oldLeading;
      if (oldMarkerMatch && newMarkerMatch) {
        const oldPrefixLen = oldLeading + oldMarkerMatch[2].length + oldMarkerMatch[4].length;
        const newPrefixLen = newLeading + newMarkerMatch[2].length + newMarkerMatch[4].length;
        if (cursorCol >= oldPrefixLen) {
          delta = newPrefixLen - oldPrefixLen;
        }
      }

      const newLineStart = newContent.split('\n').slice(0, startLineIdx).reduce((acc, l) => acc + l.length + 1, 0);
      const newCursorCol = Math.max(newLeading, cursorCol + delta);
      const newCursorPos = newLineStart + newCursorCol;

      return {
        newContent,
        selStart: newCursorPos,
        selEnd: newCursorPos,
      };
    }
  }

  // Case 2 & 3: Selection present
  if (isMultiLine) {
    // Multi-line selection: indent/outdent every selected line by 2 spaces
    for (let i = startLineIdx; i <= endLineIdx; i++) {
      if (!isShift) {
        allLines[i] = '  ' + allLines[i];
      } else {
        allLines[i] = allLines[i].replace(/^ {1,2}/, '');
      }
    }

    const renumbered = renumberLists(allLines);
    const newContent = renumbered.join('\n');

    // Multi-line selection: select the whole affected lines
    const newStartLineIndex = renumbered.slice(0, startLineIdx).reduce((acc, l) => acc + l.length + 1, 0);
    const newEndLineIndex = renumbered.slice(0, endLineIdx + 1).reduce((acc, l) => acc + l.length + 1, 0) - 1;

    return {
      newContent,
      selStart: newStartLineIndex,
      selEnd: newEndLineIndex,
    };
  } else {
    // Single line selection
    const singleLine = allLines[startLineIdx];
    const isList = isListLine(singleLine);

    let delta = 0;
    if (!isShift) {
      allLines[startLineIdx] = '  ' + singleLine;
      delta = 2;
    } else {
      const match = singleLine.match(/^ {1,2}/);
      const removed = match ? match[0].length : 0;
      allLines[startLineIdx] = singleLine.slice(removed);
      delta = -removed;
    }

    let finalLines = allLines;
    if (isList) {
      finalLines = renumberLists(allLines);
    }
    const newContent = finalLines.join('\n');

    const newStart = Math.max(lineStartIndex, start + delta);
    const newEnd = Math.max(lineStartIndex, end + delta);

    return {
      newContent,
      selStart: newStart,
      selEnd: newEnd,
    };
  }
}

/**
 * Handles Enter key on list items:
 * - Continues bullet points (- * +), numbered lists (1. 2.), or checkboxes (- [ ]).
 * - Exits the list if pressed on an empty bullet point.
 * - Renumbers subsequent numbered list items.
 */
export function handleEnterKey(
  content: string,
  start: number,
  end: number
): IndentResult | null {
  const lineStartIndex = content.lastIndexOf('\n', start - 1) + 1;
  const endPos = end > start && content[end - 1] === '\n' ? end - 1 : end;
  let lineEndIndex = content.indexOf('\n', endPos);
  if (lineEndIndex === -1) lineEndIndex = content.length;

  // If selection spans multiple lines, let default newline behavior handle it
  if (content.substring(start, end).includes('\n')) {
    return null;
  }

  const line = content.substring(lineStartIndex, lineEndIndex);
  const match = line.match(LIST_LINE_REGEX);
  if (!match) {
    return null;
  }

  const leadingSpaces = match[1];
  const marker = match[2];
  const numDelim = match[3];
  const spacesAfterMarker = match[4];
  const checkbox = match[5];
  const itemText = match[6];

  const prefixLen = leadingSpaces.length + marker.length + spacesAfterMarker.length + (checkbox ? checkbox.length + 1 : 0);
  const cursorCol = start - lineStartIndex;

  // If cursor is before the bullet marker text, don't continue the bullet
  if (cursorCol < prefixLen - 1) {
    return null;
  }

  // Case 1: Empty bullet point (item text is empty or whitespace only)
  // Pressing Enter clears the bullet or outdents if indented
  if (itemText.trim() === '') {
    if (leadingSpaces.length >= 2) {
      // Outdent by 2 spaces
      const newIndent = leadingSpaces.slice(2);
      const newPrefix = checkbox
        ? `${newIndent}${marker}${spacesAfterMarker}[ ] `
        : `${newIndent}${marker}${spacesAfterMarker}`;
      const newContent = content.substring(0, lineStartIndex) + newPrefix + content.substring(lineEndIndex);
      const newPos = lineStartIndex + newPrefix.length;
      return {
        newContent,
        selStart: newPos,
        selEnd: newPos,
      };
    } else {
      // Clear the marker completely, leaving a clean empty line
      const newContent = content.substring(0, lineStartIndex) + content.substring(lineEndIndex);
      return {
        newContent,
        selStart: lineStartIndex,
        selEnd: lineStartIndex,
      };
    }
  }

  // Case 2: Non-empty list item -> continue on next line
  const beforeCursor = line.substring(0, cursorCol);
  const afterCursor = line.substring(end - lineStartIndex);

  let nextPrefix = '';
  if (numDelim) {
    const currentNum = parseInt(marker, 10);
    const nextNum = isNaN(currentNum) ? 1 : currentNum + 1;
    const cbPart = checkbox ? '[ ] ' : '';
    nextPrefix = `${leadingSpaces}${nextNum}${numDelim}${spacesAfterMarker}${cbPart}`;
  } else {
    const cbPart = checkbox ? '[ ] ' : '';
    nextPrefix = `${leadingSpaces}${marker}${spacesAfterMarker}${cbPart}`;
  }

  // Split into lines to allow list renumbering
  const allLines = content.split('\n');
  let currentPos = 0;
  let lineIdx = 0;
  for (let i = 0; i < allLines.length; i++) {
    const nextPos = currentPos + allLines[i].length;
    if (currentPos <= lineStartIndex && lineStartIndex <= nextPos) {
      lineIdx = i;
      break;
    }
    currentPos = nextPos + 1;
  }

  allLines[lineIdx] = beforeCursor;
  allLines.splice(lineIdx + 1, 0, `${nextPrefix}${afterCursor}`);

  const renumbered = renumberLists(allLines);
  const newContent = renumbered.join('\n');

  // Calculate new cursor position (right after nextPrefix)
  const nextLineStart = renumbered.slice(0, lineIdx + 1).reduce((acc, l) => acc + l.length + 1, 0);
  const actualNextLine = renumbered[lineIdx + 1] || '';
  const actualPrefixMatch = actualNextLine.match(LIST_LINE_REGEX);
  const actualPrefixLen = actualPrefixMatch
    ? actualPrefixMatch[1].length + actualPrefixMatch[2].length + actualPrefixMatch[4].length + (actualPrefixMatch[5] ? actualPrefixMatch[5].length + 1 : 0)
    : nextPrefix.length;

  const newCursorPos = nextLineStart + actualPrefixLen;

  return {
    newContent,
    selStart: newCursorPos,
    selEnd: newCursorPos,
  };
}
