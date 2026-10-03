import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useDeferredValue,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Eye,
  Columns,
  FileEdit,
  Target,
  Undo2,
  Redo2,
} from 'lucide-react';

interface EditorAreaProps {
  notePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  onSelectWikiLink: (noteName: string) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

type EditMode = 'source' | 'split' | 'live';

// Preprocess underline syntax (++text++ and <u>text</u>) and WikiLinks [[Note Name]].
// Preserves line count so source-line mapping remains accurate.
function preprocessMarkdown(text: string): string {
  const withUnderline = text
    .replace(/<u>([\s\S]*?)<\/u>/gi, '[$1](#u)')
    .replace(/\+\+([\s\S]*?)\+\+/g, '[$1](#u)');

  return withUnderline.replace(/\[\[(.*?)\]\]/g, (_, p1) => {
    const slug = p1.trim().replace(/\s+/g, '_');
    return `[${p1.trim()}](#wikilink-${slug})`;
  });
}

function getNodeText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (React.isValidElement(node) && (node.props as { children?: React.ReactNode })?.children) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

// Stable remark plugins list
const REMARK_PLUGINS = [remarkGfm];

interface MarkdownPreviewProps {
  content: string;
  components: any;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  containerRef?: React.Ref<HTMLDivElement>;
  bottomPadding: number;
  disableHeavyPreview?: boolean;
  className?: string;
}

// Memoized preview isolated from editor toolbar/stats re-renders
const MarkdownPreview = React.memo(function MarkdownPreview({
  content,
  components,
  onScroll,
  containerRef,
  bottomPadding,
  disableHeavyPreview,
  className = '',
}: MarkdownPreviewProps) {
  const processed = useMemo(() => preprocessMarkdown(content), [content]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-y-auto ${className}`}
    >
      {disableHeavyPreview ? (
        <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-4">
          Preview is disabled on mobile for very large files. Use Source mode to edit.
        </div>
      ) : content.trim() === '' ? (
        <p className="text-text-muted italic select-none">Empty document.</p>
      ) : (
        <div className="markdown-body min-h-full">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
            {processed}
          </ReactMarkdown>
        </div>
      )}
      <div style={{ height: `${bottomPadding}px` }} aria-hidden="true" />
    </div>
  );
});

export default function EditorArea({
  notePath,
  initialContent,
  onSave,
  onSelectWikiLink,
  saveStatus,
}: EditorAreaProps) {
  const [content, setContent] = useState(initialContent);
  const contentRef = useRef(initialContent);
  contentRef.current = content;

  // Deferred content for smooth typing during markdown preview parsing
  const deferredContent = useDeferredValue(content);

  const [mode, setMode] = useState<EditMode>('source');
  const [isMobile, setIsMobile] = useState(false);
  const [wordGoal, setWordGoal] = useState<number>(0);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [paneClientHeight, setPaneClientHeight] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const scrollRatioRef = useRef<number>(0);

  // Synchronization refs
  const sourceLineOffsetsRef = useRef<number[]>([]);
  const previewAnchorsRef = useRef<{ line: number; top: number }[]>([]);
  const activeScrollOrigin = useRef<'source' | 'preview' | null>(null);
  const rafId = useRef<number | null>(null);

  // Reset editor history when switching to a different note.
  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [notePath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    mediaQuery.addEventListener('change', updateIsMobile);
    return () => mediaQuery.removeEventListener('change', updateIsMobile);
  }, []);

  // Sync external content updates without wiping local undo/redo history.
  useEffect(() => {
    if (initialContent !== contentRef.current) {
      setContent(initialContent);
      contentRef.current = initialContent;
    }
  }, [initialContent]);

  // Central edit application helper: manages undo/redo stack, autosave, and selection restore
  const applyEdit = (
    newContent: string,
    selStart?: number,
    selEnd?: number,
    options: { focusTextarea?: boolean } = { focusTextarea: true }
  ) => {
    undoStackRef.current.push(contentRef.current);
    if (undoStackRef.current.length > 200) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);

    setContent(newContent);
    contentRef.current = newContent;
    onSave(newContent);

    if (options.focusTextarea !== false && selStart !== undefined && selEnd !== undefined) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(selStart, selEnd);
        }
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val !== contentRef.current) {
      undoStackRef.current.push(contentRef.current);
      if (undoStackRef.current.length > 200) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(false);
    }
    setContent(val);
    contentRef.current = val;
    onSave(val);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop();
    if (previous === undefined) return;

    redoStackRef.current.push(contentRef.current);
    setContent(previous);
    contentRef.current = previous;
    onSave(previous);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    if (next === undefined) return;

    undoStackRef.current.push(contentRef.current);
    setContent(next);
    contentRef.current = next;
    onSave(next);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  // Section 1: Bold, Italic, Underline wrap/unwrap handler
  const handleWrapShortcut = (type: 'bold' | 'italic' | 'underline') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const marker = type === 'bold' ? '**' : type === 'italic' ? '_' : '++';
    const mLen = marker.length;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;
    const selectedText = current.substring(start, end);
    const isItalic = type === 'italic';

    // 1. Selection already wrapped inside
    if (selectedText.length >= 2 * mLen) {
      let matchesInside = false;
      if (isItalic) {
        matchesInside =
          selectedText.startsWith('_') &&
          !selectedText.startsWith('__') &&
          selectedText.endsWith('_') &&
          !selectedText.endsWith('__');
      } else {
        matchesInside = selectedText.startsWith(marker) && selectedText.endsWith(marker);
      }

      if (matchesInside) {
        const unwrapped = selectedText.slice(mLen, -mLen);
        const newContent = current.substring(0, start) + unwrapped + current.substring(end);
        applyEdit(newContent, start, start + unwrapped.length);
        return;
      }
    }

    // 2. Markers immediately outside the selection
    if (start >= mLen && end + mLen <= current.length) {
      const before = current.substring(0, start);
      const after = current.substring(end);
      let matchesOutside = false;
      if (isItalic) {
        matchesOutside =
          before.endsWith('_') &&
          !before.endsWith('__') &&
          after.startsWith('_') &&
          !after.startsWith('__');
      } else {
        matchesOutside = before.endsWith(marker) && after.startsWith(marker);
      }

      if (matchesOutside) {
        const newContent = current.substring(0, start - mLen) + selectedText + current.substring(end + mLen);
        applyEdit(newContent, start - mLen, end - mLen);
        return;
      }
    }

    // 3. Otherwise, non-empty selection -> wrap; select the whole wrapped text
    if (selectedText.length > 0) {
      const wrapped = `${marker}${selectedText}${marker}`;
      const newContent = current.substring(0, start) + wrapped + current.substring(end);
      applyEdit(newContent, start, start + wrapped.length);
      return;
    }

    // 4. No selection -> insert empty markers with cursor in the middle
    const empty = `${marker}${marker}`;
    const newContent = current.substring(0, start) + empty + current.substring(end);
    applyEdit(newContent, start + mLen, start + mLen);
  };

  // Section 8c: Ctrl/Cmd+L toggle checkbox
  const handleCheckboxShortcut = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const current = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStartIndex = current.lastIndexOf('\n', start - 1) + 1;
    const endPos = end > start && current[end - 1] === '\n' ? end - 1 : end;
    let lineEndIndex = current.indexOf('\n', endPos);
    if (lineEndIndex === -1) lineEndIndex = current.length;

    const block = current.substring(lineStartIndex, lineEndIndex);
    const lines = block.split('\n');

    // Single empty line with cursor -> "- [ ] " with cursor at end
    if (lines.length === 1 && lines[0].trim() === '') {
      const indent = lines[0].match(/^\s*/)?.[0] || '';
      const replacement = `${indent}- [ ] `;
      const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
      const newCursor = lineStartIndex + replacement.length;
      applyEdit(newContent, newCursor, newCursor);
      return;
    }

    const checkboxRegex = /^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\](?:\s+(.*)|$)/;
    const nonBlank = lines.filter((l) => l.trim() !== '');
    const allHaveCheckbox = nonBlank.length > 0 && nonBlank.every((l) => checkboxRegex.test(l));

    const newLines = lines.map((line) => {
      if (lines.length > 1 && line.trim() === '') return line;

      if (allHaveCheckbox) {
        // Remove checkbox and marker, leaving plain text
        const m = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s?(.*)$/);
        return m ? m[1] + (m[2] || '') : line;
      } else {
        // Add checkbox to lines lacking one
        if (checkboxRegex.test(line)) return line;

        const bulletMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (bulletMatch) {
          return `${bulletMatch[1]}${bulletMatch[2]} [ ] ${bulletMatch[3]}`;
        }
        const plainMatch = line.match(/^(\s*)(.*)$/);
        if (plainMatch) {
          return `${plainMatch[1]}- [ ] ${plainMatch[2]}`;
        }
        return line;
      }
    });

    const replacement = newLines.join('\n');
    const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
    if (lines.length > 1) {
      applyEdit(newContent, lineStartIndex, lineStartIndex + replacement.length);
    } else {
      const delta = replacement.length - block.length;
      applyEdit(
        newContent,
        Math.max(lineStartIndex, start + delta),
        Math.max(lineStartIndex, end + delta)
      );
    }
  };

  // Section 8d: Enter key list auto-continuation / exit
  const handleEnterKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const current = contentRef.current;
    const cursor = textarea.selectionStart;

    const lineStart = current.lastIndexOf('\n', cursor - 1) + 1;
    let lineEnd = current.indexOf('\n', cursor);
    if (lineEnd === -1) lineEnd = current.length;

    const beforeCursor = current.substring(lineStart, cursor);
    const afterCursor = current.substring(cursor, lineEnd);

    // Empty list item -> exit list
    const emptyMatch = beforeCursor.match(/^(\s*)([-*+]|\d+[.)])(\s*)(?:\[[ xX]\]\s*)?$/);
    if (emptyMatch && afterCursor.trim() === '') {
      e.preventDefault();
      const newContent = current.substring(0, lineStart) + current.substring(lineEnd);
      applyEdit(newContent, lineStart, lineStart);
      return;
    }

    // List item with content -> continue list
    const listMatch = beforeCursor.match(/^(\s*)([-*+]|\d+([.)]))(\s+)(?:\[([ xX])\](\s*))?(.*)$/);
    if (listMatch) {
      e.preventDefault();
      const indent = listMatch[1];
      const marker = listMatch[2];
      const numDelim = listMatch[3];
      const hasCheckbox = listMatch[5] !== undefined;

      let nextMarker = '';
      if (numDelim) {
        const num = parseInt(marker, 10);
        const nextNum = isNaN(num) ? 1 : num + 1;
        nextMarker = hasCheckbox ? `${indent}${nextNum}${numDelim} [ ] ` : `${indent}${nextNum}${numDelim} `;
      } else {
        nextMarker = hasCheckbox ? `${indent}${marker} [ ] ` : `${indent}${marker} `;
      }

      const newContent = current.substring(0, cursor) + '\n' + nextMarker + current.substring(cursor);
      const newCursor = cursor + 1 + nextMarker.length;
      applyEdit(newContent, newCursor, newCursor);
    }
  };

  // Section 8e: Tab / Shift+Tab on list lines
  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const current = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStartIndex = current.lastIndexOf('\n', start - 1) + 1;
    const endPos = end > start && current[end - 1] === '\n' ? end - 1 : end;
    let lineEndIndex = current.indexOf('\n', endPos);
    if (lineEndIndex === -1) lineEndIndex = current.length;

    const block = current.substring(lineStartIndex, lineEndIndex);
    const lines = block.split('\n');

    const isListLine = (l: string) => /^\s*(?:[-*+]|\d+[.)])(\s|$)/.test(l);
    if (!lines.some(isListLine)) {
      return;
    }

    e.preventDefault();
    let newLines: string[];
    if (!e.shiftKey) {
      newLines = lines.map((l) => (l.length > 0 ? '  ' + l : l));
    } else {
      newLines = lines.map((l) => l.replace(/^ {1,2}/, ''));
    }

    const replacement = newLines.join('\n');
    const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
    applyEdit(newContent, lineStartIndex, lineStartIndex + replacement.length);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      handleEnterKey(e);
      return;
    }
    if (e.key === 'Tab') {
      handleTabKey(e);
      return;
    }

    const modifierPressed = e.ctrlKey || e.metaKey;
    if (!modifierPressed) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (key === 'b' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleWrapShortcut('bold');
      return;
    }

    if (key === 'i' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleWrapShortcut('italic');
      return;
    }

    if (key === 'u' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleWrapShortcut('underline');
      return;
    }

    if (key === 'l' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleCheckboxShortcut();
      return;
    }
  };

  // Section 8b: Toggle checkbox in preview by source line or index fallback
  const handleToggleCheckboxAtLine = (lineNum: number) => {
    const current = contentRef.current;
    const lines = current.split('\n');
    const lineIdx = lineNum - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) return;

    let targetIdx = lineIdx;
    const checkboxRegex = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
    if (!checkboxRegex.test(lines[targetIdx])) {
      for (const offset of [-1, 1, -2, 2, -3, 3]) {
        const candidate = lineIdx + offset;
        if (candidate >= 0 && candidate < lines.length && checkboxRegex.test(lines[candidate])) {
          targetIdx = candidate;
          break;
        }
      }
    }

    const line = lines[targetIdx];
    const match = line?.match(checkboxRegex);
    if (!match) return;

    const newMarker = match[2] === ' ' ? '[x]' : '[ ]';
    lines[targetIdx] = line.replace(checkboxRegex, `$1${newMarker}`);
    const newContent = lines.join('\n');

    applyEdit(newContent, undefined, undefined, { focusTextarea: false });
  };

  const handleToggleCheckboxByIndex = (index: number) => {
    const current = contentRef.current;
    const lines = current.split('\n');
    const checkboxRegex = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(checkboxRegex);
      if (match) {
        if (count === index) {
          const newMarker = match[2] === ' ' ? '[x]' : '[ ]';
          lines[i] = lines[i].replace(checkboxRegex, `$1${newMarker}`);
          const newContent = lines.join('\n');
          applyEdit(newContent, undefined, undefined, { focusTextarea: false });
          return;
        }
        count++;
      }
    }
  };

  // Keep callback references stable for ReactMarkdown memoized components
  const callbacksRef = useRef({
    onWikiLinkClick: (slug: string) => {
      const originalName = slug.replace(/_/g, ' ');
      onSelectWikiLink(originalName);
    },
    onToggleCheckbox: (line: number) => {
      handleToggleCheckboxAtLine(line);
    },
    onToggleCheckboxByIndex: (index: number) => {
      handleToggleCheckboxByIndex(index);
    },
  });

  useEffect(() => {
    callbacksRef.current.onWikiLinkClick = (slug: string) => {
      const originalName = slug.replace(/_/g, ' ');
      onSelectWikiLink(originalName);
    };
    callbacksRef.current.onToggleCheckbox = (line: number) => {
      handleToggleCheckboxAtLine(line);
    };
    callbacksRef.current.onToggleCheckboxByIndex = (index: number) => {
      handleToggleCheckboxByIndex(index);
    };
  });

  // Section 10a: Stable markdown components definition
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (href === '#u') {
          return <u className="underline underline-offset-2">{children}</u>;
        }
        if (href?.startsWith('#wikilink-')) {
          const slug = href.replace('#wikilink-', '');
          return (
            <span
              className="wiki-link"
              onClick={(e) => {
                e.stopPropagation();
                callbacksRef.current.onWikiLinkClick(slug);
              }}
            >
              {children}
            </span>
          );
        }
        if (href?.startsWith('#')) {
          return (
            <a
              href={href}
              {...props}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!href || href === '#') return;
                const targetId = href.slice(1).toLowerCase();
                const targetElem =
                  document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
                if (targetElem) {
                  targetElem.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            {...props}
          >
            {children}
          </a>
        );
      },
      h1: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h1 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h1>;
      },
      h2: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h2 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h2>;
      },
      h3: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h3 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h3>;
      },
      h4: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h4 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h4>;
      },
      h5: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h5 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h5>;
      },
      h6: ({ children, node, ...props }: any) => {
        const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
        return <h6 id={id} data-source-line={node?.position?.start?.line} {...props}>{children}</h6>;
      },
      p: ({ children, node, ...props }: any) => (
        <p data-source-line={node?.position?.start?.line} {...props}>{children}</p>
      ),
      blockquote: ({ children, node, ...props }: any) => (
        <blockquote data-source-line={node?.position?.start?.line} {...props}>{children}</blockquote>
      ),
      pre: ({ children, node, ...props }: any) => (
        <pre data-source-line={node?.position?.start?.line} {...props}>{children}</pre>
      ),
      ul: ({ children, node, ...props }: any) => (
        <ul data-source-line={node?.position?.start?.line} {...props}>{children}</ul>
      ),
      ol: ({ children, node, ...props }: any) => (
        <ol data-source-line={node?.position?.start?.line} {...props}>{children}</ol>
      ),
      li: ({ children, node, ...props }: any) => (
        <li data-source-line={node?.position?.start?.line} {...props}>{children}</li>
      ),
      table: ({ children, node, ...props }: any) => (
        <table data-source-line={node?.position?.start?.line} {...props}>{children}</table>
      ),
      hr: ({ node, ...props }: any) => (
        <hr data-source-line={node?.position?.start?.line} {...props} />
      ),
      input: (props: any) => {
        const { type, checked } = props;
        if (type === 'checkbox') {
          const handleToggle = (e: React.SyntheticEvent) => {
            e.stopPropagation();
            const target = e.target as HTMLElement;
            const li = target.closest('li[data-source-line]');
            const lineStr = li?.getAttribute('data-source-line');
            if (lineStr) {
              callbacksRef.current.onToggleCheckbox(parseInt(lineStr, 10));
            } else {
              const root = target.closest('.markdown-body');
              if (root) {
                const allCheckboxes = Array.from(root.querySelectorAll('input[type="checkbox"]'));
                const idx = allCheckboxes.indexOf(target as HTMLInputElement);
                if (idx !== -1) {
                  callbacksRef.current.onToggleCheckboxByIndex(idx);
                }
              }
            }
          };

          const restProps = { ...props };
          delete restProps.type;
          delete restProps.checked;
          delete restProps.disabled;
          delete restProps.node;

          return (
            <input
              type="checkbox"
              checked={!!checked}
              onChange={handleToggle}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              {...restProps}
            />
          );
        }
        const restProps = { ...props };
        delete restProps.node;
        return <input {...restProps} />;
      },
    }),
    []
  );

  // Section 5: Measure pane clientHeight with ResizeObserver for scroll-past-the-end
  useEffect(() => {
    const el = textareaRef.current || liveContainerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPaneClientHeight(entry.target.clientHeight);
      }
    });
    ro.observe(el);
    setPaneClientHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [mode]);

  const bottomPadding = Math.max(0, paneClientHeight - 24);

  // Section 3: Measure textarea line offsets in a hidden mirror element
  const measureSourceLineOffsets = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    const style = window.getComputedStyle(textarea);
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.wordBreak = style.wordBreak;
    mirror.style.paddingLeft = style.paddingLeft;
    mirror.style.paddingRight = style.paddingRight;
    mirror.style.paddingTop = style.paddingTop;

    const lines = contentRef.current.split('\n');
    const frag = document.createDocumentFragment();
    const els: HTMLDivElement[] = [];

    for (let i = 0; i < lines.length; i++) {
      const div = document.createElement('div');
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordBreak = 'break-word';
      div.textContent = lines[i] || '\u200b';
      frag.appendChild(div);
      els.push(div);
    }

    mirror.replaceChildren(frag);
    sourceLineOffsetsRef.current = els.map((el) => el.offsetTop);
  };

  useEffect(() => {
    if (mode === 'split') {
      measureSourceLineOffsets();
    }
  }, [content, mode]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || mode !== 'split') return;

    const ro = new ResizeObserver(() => {
      measureSourceLineOffsets();
    });
    ro.observe(textarea);
    return () => ro.disconnect();
  }, [mode]);

  // Section 3: Measure preview block element anchors
  const measurePreviewAnchors = () => {
    const preview = previewContainerRef.current;
    if (!preview) return;

    const elements = Array.from(preview.querySelectorAll('[data-source-line]'));
    const previewRect = preview.getBoundingClientRect();
    const anchors = elements.map((el) => {
      const line = parseInt(el.getAttribute('data-source-line') || '0', 10);
      const rect = el.getBoundingClientRect();
      const top = rect.top - previewRect.top + preview.scrollTop;
      return { line, top };
    });

    anchors.sort((a, b) => a.line - b.line);
    previewAnchorsRef.current = anchors;
  };

  useEffect(() => {
    if (mode === 'split') {
      measurePreviewAnchors();
    }
  }, [deferredContent, mode]);

  // Section 3: Synchronize source -> preview
  const syncSourceToPreview = () => {
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxSource = textarea.scrollHeight - textarea.clientHeight;
    const maxPreview = preview.scrollHeight - preview.clientHeight;
    if (maxSource <= 0 || maxPreview <= 0) return;

    const sourceScroll = textarea.scrollTop;
    if (sourceScroll <= 0) {
      preview.scrollTop = 0;
      return;
    }
    if (sourceScroll >= maxSource - 1) {
      preview.scrollTop = maxPreview;
      return;
    }

    const offsets = sourceLineOffsetsRef.current;
    if (!offsets || offsets.length === 0) {
      preview.scrollTop = (sourceScroll / maxSource) * maxPreview;
      return;
    }

    let low = 0;
    let high = offsets.length - 1;
    let lineIdx = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (offsets[mid] <= sourceScroll) {
        lineIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const nextOffset = lineIdx + 1 < offsets.length ? offsets[lineIdx + 1] : offsets[lineIdx] + 24;
    const lineProgress =
      nextOffset > offsets[lineIdx]
        ? (sourceScroll - offsets[lineIdx]) / (nextOffset - offsets[lineIdx])
        : 0;
    const currentSourceLine = lineIdx + 1 + lineProgress;

    const anchors = previewAnchorsRef.current;
    if (!anchors || anchors.length === 0) {
      preview.scrollTop = (sourceScroll / maxSource) * maxPreview;
      return;
    }

    let a1 = anchors[0];
    let a2 = anchors[anchors.length - 1];

    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].line <= currentSourceLine) {
        a1 = anchors[i];
      }
      if (anchors[i].line > currentSourceLine) {
        a2 = anchors[i];
        break;
      }
    }

    if (a1 === a2 || a2.line === a1.line) {
      preview.scrollTop = a1.top;
      return;
    }

    const anchorProgress = (currentSourceLine - a1.line) / (a2.line - a1.line);
    const targetTop = a1.top + anchorProgress * (a2.top - a1.top);
    preview.scrollTop = Math.max(0, Math.min(maxPreview, targetTop));
  };

  // Section 3: Synchronize preview -> source
  const syncPreviewToSource = () => {
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxSource = textarea.scrollHeight - textarea.clientHeight;
    const maxPreview = preview.scrollHeight - preview.clientHeight;
    if (maxSource <= 0 || maxPreview <= 0) return;

    const previewScroll = preview.scrollTop;
    if (previewScroll <= 0) {
      textarea.scrollTop = 0;
      return;
    }
    if (previewScroll >= maxPreview - 1) {
      textarea.scrollTop = maxSource;
      return;
    }

    const anchors = previewAnchorsRef.current;
    if (!anchors || anchors.length === 0) {
      textarea.scrollTop = (previewScroll / maxPreview) * maxSource;
      return;
    }

    let a1 = anchors[0];
    let a2 = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].top <= previewScroll) {
        a1 = anchors[i];
      }
      if (anchors[i].top > previewScroll) {
        a2 = anchors[i];
        break;
      }
    }

    if (a1 === a2 || a2.top === a1.top) {
      const line = a1.line;
      const offsets = sourceLineOffsetsRef.current;
      if (offsets && line - 1 < offsets.length) {
        textarea.scrollTop = offsets[line - 1];
      }
      return;
    }

    const anchorProgress = (previewScroll - a1.top) / (a2.top - a1.top);
    const targetSourceLine = a1.line + anchorProgress * (a2.line - a1.line);

    const offsets = sourceLineOffsetsRef.current;
    if (!offsets || offsets.length === 0) {
      textarea.scrollTop = (previewScroll / maxPreview) * maxSource;
      return;
    }

    const baseLine = Math.floor(targetSourceLine);
    const frac = targetSourceLine - baseLine;
    const baseIdx = Math.max(0, Math.min(offsets.length - 1, baseLine - 1));
    const nextIdx = Math.min(offsets.length - 1, baseIdx + 1);
    const targetTop = offsets[baseIdx] + frac * (offsets[nextIdx] - offsets[baseIdx]);
    textarea.scrollTop = Math.max(0, Math.min(maxSource, targetTop));
  };

  const handleSourceScroll = () => {
    if (activeScrollOrigin.current === 'preview') return;
    activeScrollOrigin.current = 'source';

    const target = textareaRef.current;
    if (target) {
      const max = target.scrollHeight - target.clientHeight;
      if (max > 0) scrollRatioRef.current = target.scrollTop / max;
    }

    if (mode !== 'split') {
      activeScrollOrigin.current = null;
      return;
    }

    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      syncSourceToPreview();
      rafId.current = requestAnimationFrame(() => {
        activeScrollOrigin.current = null;
      });
    });
  };

  const handlePreviewScroll = () => {
    if (activeScrollOrigin.current === 'source') return;
    activeScrollOrigin.current = 'preview';

    const target = previewContainerRef.current || liveContainerRef.current;
    if (target) {
      const max = target.scrollHeight - target.clientHeight;
      if (max > 0) scrollRatioRef.current = target.scrollTop / max;
    }

    if (mode !== 'split') {
      activeScrollOrigin.current = null;
      return;
    }

    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      syncPreviewToSource();
      rafId.current = requestAnimationFrame(() => {
        activeScrollOrigin.current = null;
      });
    });
  };

  // Synchronize scroll position across mode transitions
  useEffect(() => {
    const ratio = scrollRatioRef.current;
    if (ratio <= 0) return;

    const timer = setTimeout(() => {
      if ((mode === 'source' || mode === 'split') && textareaRef.current) {
        const max = textareaRef.current.scrollHeight - textareaRef.current.clientHeight;
        if (max > 0) {
          textareaRef.current.scrollTop = ratio * max;
        }
      } else if (mode === 'live' && liveContainerRef.current) {
        const max = liveContainerRef.current.scrollHeight - liveContainerRef.current.clientHeight;
        if (max > 0) {
          liveContainerRef.current.scrollTop = ratio * max;
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [mode]);

  // Word count calculations
  const getWordCount = (text: string) => {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  };

  const getCharCount = (text: string) => {
    return text.length;
  };

  const wordCount = getWordCount(content);
  const charCount = getCharCount(content);
  const readTime = Math.ceil(wordCount / 200);
  const disableHeavyPreview = isMobile && content.length > 120000;

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(goalInput);
    if (!isNaN(val) && val >= 0) {
      setWordGoal(val);
    }
    setShowGoalDialog(false);
  };

  // Format note path display
  const noteName = notePath.split('/').pop()?.replace('.md', '') || 'Untitled';
  const folderPath = notePath.split('/').slice(0, -1).join(' > ');

  return (
    <div ref={editorContainerRef} className="flex flex-col flex-1 h-full w-full overflow-hidden bg-card-bg">
      {/* Hidden Mirror Div for Textarea Line Measuring */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -99999,
          left: -99999,
          visibility: 'hidden',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}
      />

      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border-b border-border-theme bg-card-bg z-10 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-text-muted truncate min-w-0 max-w-full">
          {folderPath && <span className="opacity-75 truncate max-w-[120px] sm:max-w-none">{folderPath} &gt; </span>}
          <span className="font-bold text-text-main text-sm truncate">{noteName}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end shrink-0">
          {/* Save Status Indicator */}
          <span className="text-xs font-medium text-text-muted mr-1 select-none whitespace-nowrap shrink-0">
            {saveStatus === 'saved' ? 'Draft saved' : 'Unsaved changes'}
          </span>

          {/* Goal Setting */}
          <button
            className="p-2 text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition"
            title="Set Word Goal"
            onClick={() => {
              setGoalInput(wordGoal > 0 ? wordGoal.toString() : '');
              setShowGoalDialog(true);
            }}
          >
            <Target size={16} style={{ color: wordGoal > 0 ? 'var(--accent)' : 'inherit' }} />
          </button>

          <button
            className="p-2 text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Ctrl/Cmd+Z)"
            onClick={handleUndo}
            disabled={!canUndo}
          >
            <Undo2 size={16} />
          </button>

          <button
            className="p-2 text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)"
            onClick={handleRedo}
            disabled={!canRedo}
          >
            <Redo2 size={16} />
          </button>

          {/* Mode Selector */}
          <div className="flex p-1 bg-sidebar-bg rounded-xl border border-border-theme/40">
            <button
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition select-none
                ${mode === 'source' ? 'bg-card-bg text-accent shadow-sm border border-border-theme/40' : 'text-text-muted hover:text-text-main'}
              `}
              onClick={() => setMode('source')}
              title="Markdown Source"
            >
              <FileEdit size={12} />
              <span className="hidden sm:inline">Source</span>
            </button>
            <button
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition select-none
                ${mode === 'split' ? 'bg-card-bg text-accent shadow-sm border border-border-theme/40' : 'text-text-muted hover:text-text-main'}
              `}
              onClick={() => setMode('split')}
              title="Split Screen"
            >
              <Columns size={12} />
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition select-none
                ${mode === 'live' ? 'bg-card-bg text-accent shadow-sm border border-border-theme/40' : 'text-text-muted hover:text-text-main'}
              `}
              onClick={() => setMode('live')}
              title="Live Preview"
            >
              <Eye size={12} />
              <span className="hidden sm:inline">Live Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 w-full h-full overflow-hidden flex">
        {mode === 'source' && (
          <div className="flex-1 h-full flex flex-col">
            <textarea
              ref={textareaRef}
              className="w-full h-full resize-none p-4 sm:p-[27px] bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto"
              style={{ paddingBottom: `${bottomPadding}px` }}
              value={content}
              onChange={handleChange}
              onKeyDown={handleEditorKeyDown}
              onScroll={handleSourceScroll}
              placeholder="Start writing in markdown..."
            />
          </div>
        )}

        {mode === 'split' && (
          <div className="flex flex-col lg:flex-row flex-1 w-full h-full overflow-hidden">
            <div className="flex-1 min-h-0 h-1/2 lg:h-full flex flex-col overflow-hidden">
              <textarea
                ref={textareaRef}
                className="w-full h-full resize-none p-4 sm:p-[27px] bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto"
                style={{ paddingBottom: `${bottomPadding}px` }}
                value={content}
                onChange={handleChange}
                onKeyDown={handleEditorKeyDown}
                onScroll={handleSourceScroll}
                placeholder="Start writing in markdown..."
              />
            </div>
            <MarkdownPreview
              content={deferredContent}
              components={markdownComponents}
              onScroll={handlePreviewScroll}
              containerRef={previewContainerRef}
              bottomPadding={bottomPadding}
              disableHeavyPreview={disableHeavyPreview}
              className="flex-1 min-h-0 h-1/2 lg:h-full p-4 sm:p-[27px] border-t lg:border-t-0 lg:border-l border-border-theme bg-card-bg"
            />
          </div>
        )}

        {mode === 'live' && (
          <MarkdownPreview
            content={deferredContent}
            components={markdownComponents}
            onScroll={handlePreviewScroll}
            containerRef={liveContainerRef}
            bottomPadding={bottomPadding}
            disableHeavyPreview={disableHeavyPreview}
            className="flex-1 h-full p-4 sm:p-[27px] bg-card-bg select-text"
          />
        )}
      </div>

      {/* Stats Footer */}
      <div className="h-10 border-t border-border-theme bg-card-bg flex items-center justify-between px-3 sm:px-6 text-xs text-text-muted select-none">
        <div className="flex items-center gap-2 sm:gap-4">
          <span>{wordCount} words</span>
          <span className="hidden sm:inline">{charCount} characters</span>
          <span className="hidden sm:inline">{readTime} min read</span>
        </div>

        {wordGoal > 0 && (
          <div className="flex items-center gap-2">
            <span>Goal: {wordCount} / {wordGoal} words</span>
            <div className="w-24 h-1.5 bg-sidebar-bg rounded-full overflow-hidden" title={`${Math.min(100, Math.round((wordCount / wordGoal) * 100))}% completed`}>
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${Math.min(100, (wordCount / wordGoal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Goal Modal */}
      {showGoalDialog && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleGoalSubmit} className="bg-card-bg border border-border-theme w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-lg font-bold text-text-main">Set Writing Word Goal</div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Target Word Count (0 to disable)</label>
              <input
                type="number"
                className="w-full px-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg text-sm text-text-main focus:outline-none transition"
                placeholder="e.g. 1000"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                autoFocus
                min="0"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition"
                onClick={() => setShowGoalDialog(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition shadow-sm"
              >
                Save Goal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
