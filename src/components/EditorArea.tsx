'use client';

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useDeferredValue,
  useCallback,
} from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Eye,
  Columns,
  FileEdit,
  Target,
  Undo2,
  Redo2,
  ExternalLink,
} from 'lucide-react';
import type { FileNode } from '@/lib/notes';
import { handleTabIndent, handleEnterKey } from '@/lib/editorIndent';
import {
  resolveLink,
  createSlugger,
  findLinksInMarkdown,
} from '@/lib/linkUtils';
import { preprocessMarkdown } from '@/lib/markdownUtils';
import BreadcrumbNavigator from './BreadcrumbNavigator';
import FormattingToolbar, { ActiveFormats } from './FormattingToolbar';
import LinkMakerModal, { ExistingLinkData } from './LinkMakerModal';
import BacklinksPanel from './BacklinksPanel';
import NoteEmbed from './NoteEmbed';

interface EditorAreaProps {
  notePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  projects: { name: string; emoji: string }[];
  activeProjectTree: FileNode[];
  onSelectNote: (fullPath: string, anchor?: string) => void;
  onSelectFolder?: (folderPath: string) => void;
}

type EditMode = 'source' | 'split' | 'live';

function getNodeText(node: React.ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (React.isValidElement(node) && (node.props as { children?: React.ReactNode })?.children) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

// Strips Obsidian/mcnotes-style block IDs (^blockid) from rendered preview text while preserving the ID for anchor targeting
function stripBlockIdFromChildren(children: React.ReactNode): { cleanedChildren: React.ReactNode; blockId: string | null } {
  let foundId: string | null = null;

  function walk(node: React.ReactNode): React.ReactNode {
    if (typeof node === 'string') {
      const match = node.match(/\s+\^([a-zA-Z0-9_-]+)$/);
      if (match) {
        foundId = match[1];
        return node.slice(0, match.index);
      }
      return node;
    }
    if (Array.isArray(node)) {
      let alreadyStripped = false;
      const reversed = [...node].reverse().map((child) => {
        if (!alreadyStripped) {
          const res = walk(child);
          if (foundId) {
            alreadyStripped = true;
            return res;
          }
        }
        return child;
      });
      return reversed.reverse();
    }
    if (React.isValidElement(node) && (node.props as any)?.children) {
      const childProps = node.props as any;
      const res = walk(childProps.children);
      if (foundId) {
        return React.cloneElement(node, { ...childProps, children: res });
      }
    }
    return node;
  }

  const cleanedChildren = walk(children);
  return { cleanedChildren, blockId: foundId };
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
  style?: React.CSSProperties;
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
  style,
}: MarkdownPreviewProps) {
  const processed = useMemo(() => preprocessMarkdown(content), [content]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`overflow-y-auto ${className}`}
      style={{ ...style, paddingBottom: `${bottomPadding}px` }}
    >
      {disableHeavyPreview ? (
        <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-4">
          Preview is disabled on mobile for very large files. Use Source mode to edit.
        </div>
      ) : content.trim() === '' ? (
        <p className="text-text-muted italic select-none">Empty document.</p>
      ) : (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
            {processed}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
});

export default function EditorArea({
  notePath,
  initialContent,
  onSave,
  saveStatus,
  projects,
  activeProjectTree,
  onSelectNote,
  onSelectFolder,
}: EditorAreaProps) {
  const [content, setContent] = useState(initialContent);
  const contentRef = useRef(initialContent);
  contentRef.current = content;

  // Deferred content for smooth typing during markdown preview parsing
  const deferredContent = useDeferredValue(content);

  // View mode persisted in localStorage (survives reloads and note switches)
  const [mode, setMode] = useState<EditMode>('source');
  const pendingScrollAnchorRef = useRef<{ topSourceLine: number; savedScrollTop: number } | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [wordGoal, setWordGoal] = useState<number>(0);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [paneClientHeight, setPaneClientHeight] = useState<number>(0);

  // Link maker modal state
  const [showLinkMaker, setShowLinkMaker] = useState(false);
  const [linkMakerEmbed, setLinkMakerEmbed] = useState(false);
  const [activeExistingLink, setActiveExistingLink] = useState<ExistingLinkData | null>(null);

  // Floating "Open link" button in Source mode
  const [floatingLink, setFloatingLink] = useState<{
    href: string;
    text: string;
    top: number;
    left: number;
  } | null>(null);

  // Toast notification for broken links
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active formatting state for toolbar
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>({
    headingLevel: 0,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    codeBlock: false,
    quote: false,
    listType: null,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const savedSelectionRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  // Synchronization refs
  const sourceLineOffsetsRef = useRef<number[]>([]);
  const activeScrollOrigin = useRef<'source' | 'preview' | null>(null);
  const rafId = useRef<number | null>(null);

  // Known note paths for link validation (client cache)
  const [knownNotePaths, setKnownNotePaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const res = await fetch('/api/notes/links/all');
        if (res.ok) {
          const data = await res.json();
          const paths = new Set<string>();
          for (const item of data.items || []) {
            paths.add(item.path);
            if (item.path.endsWith('/')) {
              paths.add(item.path.slice(0, -1));
            }
          }
          setKnownNotePaths(paths);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchPaths();
  }, [notePath]);

  // Load view mode from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('notes-view-mode') as EditMode;
    if (savedMode && (savedMode === 'source' || savedMode === 'split' || savedMode === 'live')) {
      setMode(savedMode);
    }
  }, []);

  // Reset editor history when switching to a different note
  useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setFloatingLink(null);
  }, [notePath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();
    mediaQuery.addEventListener('change', updateIsMobile);
    return () => mediaQuery.removeEventListener('change', updateIsMobile);
  }, []);

  // Sync external content updates without wiping undo/redo history
  useEffect(() => {
    if (initialContent !== contentRef.current) {
      setContent(initialContent);
      contentRef.current = initialContent;
    }
  }, [initialContent]);

  // Central edit application helper
  const applyEdit = useCallback(
    (
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

      const savedScrollTop = textareaRef.current?.scrollTop;

      setContent(newContent);
      contentRef.current = newContent;
      onSave(newContent);

      if (options.focusTextarea !== false && selStart !== undefined && selEnd !== undefined) {
        savedSelectionRangeRef.current = { start: selStart, end: selEnd };
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus({ preventScroll: true });
            textareaRef.current.setSelectionRange(selStart, selEnd);
            if (savedScrollTop !== undefined) {
              textareaRef.current.scrollTop = savedScrollTop;
            }
          }
        });
      }
    },
    [onSave]
  );

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
    updateActiveFormatsAndLink();
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

  // Section 5: Smooth content-anchored view-mode switching without visual glitches
  const handleModeSwitch = (targetMode: EditMode) => {
    if (targetMode === mode) return;

    // 1. Determine top-visible source line before switching
    let topSourceLine = 1;
    let savedScrollTop = 0;
    const textarea = textareaRef.current;
    const liveContainer = liveContainerRef.current;
    const previewContainer = previewContainerRef.current;

    if ((mode === 'source' || mode === 'split') && textarea) {
      savedSelectionRangeRef.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
      savedScrollTop = textarea.scrollTop;
      const offsets = sourceLineOffsetsRef.current;
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] <= savedScrollTop) {
          topSourceLine = i + 1;
        } else {
          break;
        }
      }
    } else {
      const activeContainer = mode === 'live' ? liveContainer : previewContainer;
      if (activeContainer) {
        const elements = Array.from(activeContainer.querySelectorAll<HTMLElement>('[data-source-line]'));
        const rect = activeContainer.getBoundingClientRect();
        for (const el of elements) {
          const elRect = el.getBoundingClientRect();
          if (elRect.top - rect.top >= -20) {
            const l = parseInt(el.getAttribute('data-source-line') || '1', 10);
            if (l > 0) {
              topSourceLine = l;
              break;
            }
          }
        }
      }
    }

    pendingScrollAnchorRef.current = { topSourceLine, savedScrollTop };
    setMode(targetMode);
    localStorage.setItem('notes-view-mode', targetMode);
  };

  // Synchronously restore scroll position before the browser paints the new view
  useIsomorphicLayoutEffect(() => {
    if (!pendingScrollAnchorRef.current) return;
    const { topSourceLine, savedScrollTop } = pendingScrollAnchorRef.current;
    pendingScrollAnchorRef.current = null;

    measureSourceLineOffsets();

    if (mode === 'source' || mode === 'split') {
      const newTextarea = textareaRef.current;
      if (newTextarea) {
        const offsets = sourceLineOffsetsRef.current;
        const targetTop = offsets[topSourceLine - 1] ?? savedScrollTop;
        newTextarea.scrollTop = targetTop;

        const { start, end } = savedSelectionRangeRef.current;
        try {
          newTextarea.setSelectionRange(start, end);
        } catch {
          // ignore
        }
        newTextarea.scrollTop = targetTop;
      }
    }

    if (mode === 'live' || mode === 'split') {
      const targetContainer = mode === 'live' ? liveContainerRef.current : previewContainerRef.current;
      if (targetContainer) {
        const elements = Array.from(targetContainer.querySelectorAll<HTMLElement>('[data-source-line]'));
        let targetEl: HTMLElement | null = null;
        let bestLine = -1;

        for (const el of elements) {
          const l = parseInt(el.getAttribute('data-source-line') || '0', 10);
          if (l <= topSourceLine && l > bestLine) {
            bestLine = l;
            targetEl = el;
          }
        }

        if (!targetEl && elements.length > 0) {
          targetEl = elements[0];
        }

        if (targetEl) {
          const containerRect = targetContainer.getBoundingClientRect();
          const elRect = targetEl.getBoundingClientRect();
          targetContainer.scrollTop = elRect.top - containerRect.top + targetContainer.scrollTop;
        }
      }
    }
  }, [mode]);

  // Section 3: Tab / Shift+Tab indent behavior
  const handleEditorTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const isShift = e.shiftKey;

    const result = handleTabIndent(contentRef.current, start, end, isShift);
    applyEdit(result.newContent, result.selStart, result.selEnd);
  };

  // Section 7: Update active formatting detection and link detection at cursor
  const updateActiveFormatsAndLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    savedSelectionRangeRef.current = { start, end };
    const current = contentRef.current;

    // Check line-level formats
    const lineStart = current.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = current.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = current.length;
    const line = current.substring(lineStart, lineEnd);

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+/);
    const headingLevel = headingMatch ? headingMatch[1].length : 0;

    // Quote
    const quote = /^\s*>\s+/.test(line);

    // List
    let listType: 'bullet' | 'numbered' | 'checkbox' | null = null;
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      listType = 'checkbox';
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      listType = 'numbered';
    } else if (/^\s*[-*+]\s+/.test(line)) {
      listType = 'bullet';
    }

    // Inline formats around cursor
    const checkWrap = (marker: string): boolean => {
      const mLen = marker.length;
      if (start >= mLen && current.substring(start - mLen, start) === marker && current.substring(end, end + mLen) === marker) {
        return true;
      }
      const before = current.substring(0, start);
      const after = current.substring(end);
      const lastOpen = before.lastIndexOf(marker);
      const nextClose = after.indexOf(marker);
      return lastOpen !== -1 && nextClose !== -1 && !before.slice(lastOpen + mLen).includes('\n');
    };

    const bold = checkWrap('**');
    const italic = checkWrap('_');
    const underline = checkWrap('++');
    const strikethrough = checkWrap('~~');
    const code = checkWrap('`');
    const codeBlock = current.slice(0, start).split('```').length % 2 === 0;

    setActiveFormats({
      headingLevel,
      bold,
      italic,
      underline,
      strikethrough,
      code,
      codeBlock,
      quote,
      listType,
    });

    // Check if cursor is inside an existing link for floating "Open link" button and link maker prefill
    const links = findLinksInMarkdown(current);
    const foundLink = links.find((l) => l.index <= start && start <= l.index + l.fullMatch.length);

    if (foundLink) {
      setActiveExistingLink({
        text: foundLink.text,
        url: foundLink.href,
        isEmbed: foundLink.isEmbed,
        replaceStart: foundLink.index,
        replaceEnd: foundLink.index + foundLink.fullMatch.length,
      });

      // Calculate floating button coordinates in source mode
      if (start === end && mirrorRef.current && textareaRef.current) {
        const lineIdx = current.slice(0, foundLink.index).split('\n').length - 1;
        const lineTop = sourceLineOffsetsRef.current[lineIdx] || 0;
        const relativeTop = lineTop - textarea.scrollTop;
        if (relativeTop >= 0 && relativeTop <= textarea.clientHeight) {
          setFloatingLink({
            href: foundLink.href,
            text: foundLink.text,
            top: relativeTop,
            left: 20,
          });
        } else {
          setFloatingLink(null);
        }
      } else {
        setFloatingLink(null);
      }
    } else {
      setActiveExistingLink(null);
      setFloatingLink(null);
    }
  };

  // Section 7: Toolbar formatting toggler
  const handleToggleFormat = (format: string, value?: any) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;

    if (format === 'bold') {
      handleWrapShortcut('bold');
    } else if (format === 'italic') {
      handleWrapShortcut('italic');
    } else if (format === 'underline') {
      handleWrapShortcut('underline');
    } else if (format === 'strikethrough') {
      handleWrapShortcutCustom('~~');
    } else if (format === 'code') {
      handleWrapShortcutCustom('`');
    } else if (format === 'codeBlock') {
      const selected = current.substring(start, end);
      if (selected) {
        const wrapped = `\`\`\`\n${selected}\n\`\`\``;
        const newContent = current.substring(0, start) + wrapped + current.substring(end);
        applyEdit(newContent, start, start + wrapped.length);
      } else {
        const empty = `\`\`\`\n\n\`\`\``;
        const newContent = current.substring(0, start) + empty + current.substring(end);
        applyEdit(newContent, start + 4, start + 4);
      }
    } else if (format === 'quote') {
      handleToggleLinePrefix('> ');
    } else if (format === 'heading') {
      const level = typeof value === 'number' ? value : 1;
      handleToggleHeading(level);
    } else if (format === 'list') {
      const type = value as 'bullet' | 'numbered' | 'checkbox';
      handleToggleList(type);
    }
  };

  const handleToggleHeading = (level: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;

    const lineStartIndex = current.lastIndexOf('\n', start - 1) + 1;
    const endPos = end > start && current[end - 1] === '\n' ? end - 1 : end;
    let lineEndIndex = current.indexOf('\n', endPos);
    if (lineEndIndex === -1) lineEndIndex = current.length;

    const block = current.substring(lineStartIndex, lineEndIndex);
    const lines = block.split('\n');

    const prefix = `${'#'.repeat(level)} `;
    const allHaveLevel = lines.every((l) => l.startsWith(prefix));

    const newLines = lines.map((l) => {
      const stripped = l.replace(/^#{1,6}\s+/, '');
      if (allHaveLevel) {
        return stripped;
      }
      return `${prefix}${stripped}`;
    });

    const replacement = newLines.join('\n');
    const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
    if (lines.length > 1) {
      applyEdit(newContent, lineStartIndex, lineStartIndex + replacement.length);
    } else {
      const delta = replacement.length - block.length;
      applyEdit(newContent, Math.max(lineStartIndex, start + delta), Math.max(lineStartIndex, end + delta));
    }
  };

  const handleToggleList = (type: 'bullet' | 'numbered' | 'checkbox') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;

    const lineStartIndex = current.lastIndexOf('\n', start - 1) + 1;
    const endPos = end > start && current[end - 1] === '\n' ? end - 1 : end;
    let lineEndIndex = current.indexOf('\n', endPos);
    if (lineEndIndex === -1) lineEndIndex = current.length;

    const block = current.substring(lineStartIndex, lineEndIndex);
    const lines = block.split('\n');

    const listRegex = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

    const newLines = lines.map((l, i) => {
      const match = l.match(listRegex);
      const indent = match ? match[1] : l.match(/^\s*/)?.[0] || '';
      const text = match ? l.slice(match[0].length) : l.replace(/^\s*/, '');

      if (type === 'bullet') {
        return `${indent}- ${text}`;
      } else if (type === 'numbered') {
        return `${indent}${i + 1}. ${text}`;
      } else {
        return `${indent}- [ ] ${text}`;
      }
    });

    const replacement = newLines.join('\n');
    const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
    if (lines.length > 1) {
      applyEdit(newContent, lineStartIndex, lineStartIndex + replacement.length);
    } else {
      const delta = replacement.length - block.length;
      applyEdit(newContent, Math.max(lineStartIndex, start + delta), Math.max(lineStartIndex, end + delta));
    }
  };

  const handleToggleLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;

    const lineStartIndex = current.lastIndexOf('\n', start - 1) + 1;
    const endPos = end > start && current[end - 1] === '\n' ? end - 1 : end;
    let lineEndIndex = current.indexOf('\n', endPos);
    if (lineEndIndex === -1) lineEndIndex = current.length;

    const block = current.substring(lineStartIndex, lineEndIndex);
    const lines = block.split('\n');
    const allHavePrefix = lines.every((l) => l.startsWith(prefix));

    const newLines = lines.map((l) => {
      if (allHavePrefix) {
        return l.startsWith(prefix) ? l.slice(prefix.length) : l;
      }
      return `${prefix}${l}`;
    });

    const replacement = newLines.join('\n');
    const newContent = current.substring(0, lineStartIndex) + replacement + current.substring(lineEndIndex);
    if (lines.length > 1) {
      applyEdit(newContent, lineStartIndex, lineStartIndex + replacement.length);
    } else {
      const delta = replacement.length - block.length;
      applyEdit(newContent, Math.max(lineStartIndex, start + delta), Math.max(lineStartIndex, end + delta));
    }
  };

  const handleWrapShortcutCustom = (marker: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const mLen = marker.length;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = contentRef.current;
    const selected = current.substring(start, end);

    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= 2 * mLen) {
      const unwrapped = selected.slice(mLen, -mLen);
      const newContent = current.substring(0, start) + unwrapped + current.substring(end);
      applyEdit(newContent, start, start + unwrapped.length);
      return;
    }

    if (
      start >= mLen &&
      end + mLen <= current.length &&
      current.substring(start - mLen, start) === marker &&
      current.substring(end, end + mLen) === marker
    ) {
      const newContent = current.substring(0, start - mLen) + selected + current.substring(end + mLen);
      applyEdit(newContent, start - mLen, end - mLen);
      return;
    }

    if (selected.length > 0) {
      const wrapped = `${marker}${selected}${marker}`;
      const newContent = current.substring(0, start) + wrapped + current.substring(end);
      applyEdit(newContent, start, start + wrapped.length);
      return;
    }

    const empty = `${marker}${marker}`;
    const newContent = current.substring(0, start) + empty + current.substring(end);
    applyEdit(newContent, start + mLen, start + mLen);
  };

  const handleWrapShortcut = (type: 'bold' | 'italic' | 'underline') => {
    const marker = type === 'bold' ? '**' : type === 'italic' ? '_' : '++';
    handleWrapShortcutCustom(marker);
  };

  const handleInsertTable = (rows: number, cols: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? savedSelectionRangeRef.current.start;
    const current = contentRef.current;

    const header = '| ' + Array.from({ length: cols }, (_, i) => `Column ${i + 1}`).join(' | ') + ' |';
    const separator = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
    const bodyRows = Array.from({ length: rows - 1 }, () => '| ' + Array.from({ length: cols }, () => ' ').join(' | ') + ' |');
    const tableText = `\n${header}\n${separator}\n${bodyRows.join('\n')}\n`;

    const newContent = current.substring(0, start) + tableText + current.substring(start);
    const newCursor = start + tableText.length;
    applyEdit(newContent, newCursor, newCursor);
  };

  const handleInsertHr = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const current = contentRef.current;
    const hrText = '\n---\n';
    const newContent = current.substring(0, start) + hrText + current.substring(start);
    applyEdit(newContent, start + hrText.length, start + hrText.length);
  };

  // Keyboard shortcuts
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      handleEditorTabKey(e);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const result = handleEnterKey(contentRef.current, start, end);
        if (result) {
          e.preventDefault();
          applyEdit(result.newContent, result.selStart, result.selEnd);
          return;
        }
      }
    }

    const modifier = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+Alt+1...6 (Heading levels H1-H6)
    if (modifier && e.altKey && !e.shiftKey) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 6) {
        e.preventDefault();
        handleToggleHeading(num);
        return;
      }
    }

    if (!modifier) return;

    const key = e.key.toLowerCase();

    // Ctrl/Cmd+K (Link maker dialog)
    if (key === 'k' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setLinkMakerEmbed(false);
      setShowLinkMaker(true);
      return;
    }

    // Ctrl/Cmd+Shift+E (Embed dialog pre-checked)
    if (key === 'e' && e.shiftKey && !e.altKey) {
      e.preventDefault();
      setLinkMakerEmbed(true);
      setShowLinkMaker(true);
      return;
    }

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
      handleToggleList('checkbox');
      return;
    }
  };

  // Following links from preview or source mode
  const handleFollowLink = useCallback(
    (rawHref: string) => {
      const resolved = resolveLink(notePath, rawHref);
      if (!resolved.isValid) {
        setToastMessage('Invalid link');
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }

      if (resolved.isExternal) {
        window.open(resolved.targetFullPath, '_blank', 'noopener,noreferrer');
        return;
      }

      if (resolved.isAnchorOnly) {
        const decodedAnchor = decodeURIComponent(resolved.anchor || '');
        const el = document.getElementById(decodedAnchor) ||
                   document.getElementById(decodedAnchor.replace(/^\^/, '')) ||
                   document.getElementById(`^${decodedAnchor}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else {
          setToastMessage(`Section #${decodedAnchor} not found`);
          setTimeout(() => setToastMessage(null), 3000);
        }
        return;
      }

      if (resolved.isFolder) {
        if (onSelectFolder) {
          onSelectFolder(resolved.targetFullPath);
        }
        return;
      }

      // Check if note exists
      const targetNoteExists =
        knownNotePaths.has(resolved.targetFullPath) ||
        knownNotePaths.size === 0; // If paths not loaded yet, attempt navigation

      if (!targetNoteExists) {
        setToastMessage(`Note not found: ${resolved.targetFullPath}`);
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }

      onSelectNote(resolved.targetFullPath, resolved.anchor);
    },
    [notePath, knownNotePaths, onSelectNote, onSelectFolder]
  );

  // Section 8b: Toggle checkbox in preview by source line
  const handleToggleCheckboxAtLine = useCallback((lineNum: number) => {
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
  }, [applyEdit]);

  // Section 10a: Markdown preview components
  const sluggerRef = useRef(createSlugger());
  useEffect(() => {
    sluggerRef.current = createSlugger();
  }, [deferredContent]);

  const markdownComponents = useMemo(() => {
    return {
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (href === '#u') {
          return <u className="underline underline-offset-2">{children}</u>;
        }

        if (!href) return <a>{children}</a>;

        const resolved = resolveLink(notePath, href);

        // Check broken link
        const isBroken =
          !resolved.isExternal &&
          !resolved.isAnchorOnly &&
          !resolved.isFolder &&
          knownNotePaths.size > 0 &&
          !knownNotePaths.has(resolved.targetFullPath);

        if (isBroken) {
          return (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setToastMessage(`Note not found: ${resolved.targetFullPath}`);
                setTimeout(() => setToastMessage(null), 3000);
              }}
              className="text-red-500/80 underline decoration-dashed cursor-pointer font-medium hover:text-red-600 transition"
              title={`Broken link (target not found: ${resolved.targetFullPath})`}
            >
              {children}
            </span>
          );
        }

        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFollowLink(href);
            }}
            className="text-accent underline hover:text-accent-hover font-medium cursor-pointer transition"
            {...props}
          >
            {children}
          </a>
        );
      },
      img: (props: any) => {
        const { src, alt } = props;
        if (src && (src.endsWith('.md') || src.includes('.md#') || src.includes('.md?') || src.startsWith('#'))) {
          return (
            <NoteEmbed
              src={src}
              currentNotePath={notePath}
              onNavigate={onSelectNote}
              depth={1}
            />
          );
        }
        {/* eslint-disable-next-line @next/next/no-img-element */}
        return <img {...props} alt={alt || ''} />;
      },
      h1: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h1 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h1>;
      },
      h2: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h2 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h2>;
      },
      h3: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h3 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h3>;
      },
      h4: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h4 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h4>;
      },
      h5: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h5 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h5>;
      },
      h6: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        const text = getNodeText(cleanedChildren);
        const slug = sluggerRef.current(text);
        return <h6 id={blockId ? `^${blockId}` : slug} data-source-line={node?.position?.start?.line} {...props}>{cleanedChildren}</h6>;
      },
      p: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        return (
          <p id={blockId ? `^${blockId}` : undefined} data-source-line={node?.position?.start?.line} {...props}>
            {cleanedChildren}
          </p>
        );
      },
      blockquote: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        return (
          <blockquote id={blockId ? `^${blockId}` : undefined} data-source-line={node?.position?.start?.line} {...props}>
            {cleanedChildren}
          </blockquote>
        );
      },
      pre: ({ children, node, ...props }: any) => (
        <pre data-source-line={node?.position?.start?.line} {...props}>{children}</pre>
      ),
      ul: ({ children, node, ...props }: any) => (
        <ul data-source-line={node?.position?.start?.line} {...props}>{children}</ul>
      ),
      ol: ({ children, node, ...props }: any) => (
        <ol data-source-line={node?.position?.start?.line} {...props}>{children}</ol>
      ),
      li: ({ children, node, ...props }: any) => {
        const { cleanedChildren, blockId } = stripBlockIdFromChildren(children);
        return (
          <li id={blockId ? `^${blockId}` : undefined} data-source-line={node?.position?.start?.line} {...props}>
            {cleanedChildren}
          </li>
        );
      },
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
              handleToggleCheckboxAtLine(parseInt(lineStr, 10));
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
    };
  }, [notePath, knownNotePaths, handleFollowLink, onSelectNote, handleToggleCheckboxAtLine]);

  // Section 5: Measure pane clientHeight with ResizeObserver for scroll-past-the-end
  useEffect(() => {
    const el = textareaRef.current || liveContainerRef.current || previewContainerRef.current;
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
    if (mode === 'split' || mode === 'source') {
      measureSourceLineOffsets();
    }
  }, [content, mode]);

  // Scroll synchronization between source and preview in Split mode
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

    let lineIdx = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= sourceScroll) {
        lineIdx = i;
      } else {
        break;
      }
    }

    const nextOffset = lineIdx + 1 < offsets.length ? offsets[lineIdx + 1] : offsets[lineIdx] + 24;
    const progress = nextOffset > offsets[lineIdx] ? (sourceScroll - offsets[lineIdx]) / (nextOffset - offsets[lineIdx]) : 0;
    const currentLine = lineIdx + 1 + progress;

    const targetEl = preview.querySelector(`[data-source-line="${Math.round(currentLine)}"]`);
    if (targetEl) {
      const pRect = preview.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();
      preview.scrollTop = elRect.top - pRect.top + preview.scrollTop;
    } else {
      preview.scrollTop = (sourceScroll / maxSource) * maxPreview;
    }
  };

  // Scroll synchronization from preview to source in Split mode
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
    if (maxPreview > 50 && previewScroll >= maxPreview - 1) {
      textarea.scrollTop = maxSource;
      return;
    }

    const elements = Array.from(preview.querySelectorAll<HTMLElement>('[data-source-line]'));
    const pRect = preview.getBoundingClientRect();
    let bestLine = -1;
    let minPositiveDist = Infinity;

    for (const el of elements) {
      const elRect = el.getBoundingClientRect();
      const dist = elRect.top - pRect.top;
      if (dist >= -20 && dist < minPositiveDist) {
        minPositiveDist = dist;
        const l = parseInt(el.getAttribute('data-source-line') || '1', 10);
        if (l > 0) {
          bestLine = l;
          break;
        }
      }
    }

    const offsets = sourceLineOffsetsRef.current;
    if (bestLine > 0 && offsets && offsets.length >= bestLine) {
      const targetTop = offsets[bestLine - 1] || 0;
      textarea.scrollTop = Math.min(maxSource, Math.max(0, targetTop));
    } else {
      textarea.scrollTop = (previewScroll / maxPreview) * maxSource;
    }
  };

  const handlePreviewScroll = () => {
    if (mode === 'split') {
      if (activeScrollOrigin.current === 'source') return;
      activeScrollOrigin.current = 'preview';

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        syncPreviewToSource();
        rafId.current = requestAnimationFrame(() => {
          activeScrollOrigin.current = null;
        });
      });
    }
  };

  const handleSourceScroll = () => {
    if (mode === 'split') {
      if (activeScrollOrigin.current === 'preview') return;
      activeScrollOrigin.current = 'source';

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        syncSourceToPreview();
        rafId.current = requestAnimationFrame(() => {
          activeScrollOrigin.current = null;
        });
      });
    }
    updateActiveFormatsAndLink();
  };

  // Word count calculations
  const getWordCount = (text: string) => {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  };

  const wordCount = getWordCount(content);
  const charCount = content.length;
  const readTime = Math.ceil(wordCount / 200);
  const disableHeavyPreview = isMobile && content.length > 120000;

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(goalInput, 10);
    if (!isNaN(val) && val >= 0) {
      setWordGoal(val);
    }
    setShowGoalDialog(false);
  };

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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Workspace Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border-b border-border-theme bg-card-bg z-40 shrink-0">
        {/* Interactive Breadcrumb Navigator (§1) */}
        <BreadcrumbNavigator
          notePath={notePath}
          projects={projects}
          activeProjectTree={activeProjectTree}
          onSelectNote={onSelectNote}
        />

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

          {/* Mode Selector (§5) */}
          <div className="flex p-1 bg-sidebar-bg rounded-xl border border-border-theme/40">
            <button
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition select-none
                ${mode === 'source' ? 'bg-card-bg text-accent shadow-sm border border-border-theme/40' : 'text-text-muted hover:text-text-main'}
              `}
              onClick={() => handleModeSwitch('source')}
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
              onClick={() => handleModeSwitch('split')}
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
              onClick={() => handleModeSwitch('live')}
              title="Live Preview"
            >
              <Eye size={12} />
              <span className="hidden sm:inline">Live Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Formatting Toolbar (§7) — Shown in Source & Split modes, hidden in Live Preview */}
      {mode !== 'live' && (
        <FormattingToolbar
          activeFormats={activeFormats}
          onToggleFormat={handleToggleFormat}
          onInsertTable={handleInsertTable}
          onInsertHr={handleInsertHr}
          onOpenLinkMaker={(isEmbed) => {
            setLinkMakerEmbed(!!isEmbed);
            setShowLinkMaker(true);
          }}
        />
      )}

      {/* Editor Body */}
      <div className="flex-1 w-full h-full overflow-hidden flex relative z-10">
        {/* Floating "Open link" button in Source mode (§6.5) */}
        {floatingLink && (mode === 'source' || mode === 'split') && (
          <div
            style={{
              position: 'absolute',
              top: `${Math.max(8, floatingLink.top - 28)}px`,
              right: '24px',
              zIndex: 30,
            }}
            className="animate-in fade-in zoom-in-95 duration-100"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleFollowLink(floatingLink.href)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent text-white text-xs font-bold rounded-lg shadow-lg hover:bg-accent-hover transition cursor-pointer select-none"
              title={`Open link: ${floatingLink.href}`}
            >
              <span>Open link</span>
              <ExternalLink size={12} />
            </button>
          </div>
        )}

        {mode === 'source' && (
          <div className="flex-1 h-full flex flex-col">
            <textarea
              ref={textareaRef}
              className="w-full h-full resize-none p-4 sm:p-[27px] bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto text-base sm:text-sm"
              style={{ paddingBottom: `${bottomPadding}px` }}
              value={content}
              onChange={handleChange}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={updateActiveFormatsAndLink}
              onMouseUp={updateActiveFormatsAndLink}
              onSelect={updateActiveFormatsAndLink}
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
                className="w-full h-full resize-none p-4 sm:p-[27px] bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto text-base sm:text-sm"
                style={{ paddingBottom: `${bottomPadding}px` }}
                value={content}
                onChange={handleChange}
                onKeyDown={handleEditorKeyDown}
                onKeyUp={updateActiveFormatsAndLink}
                onMouseUp={updateActiveFormatsAndLink}
                onSelect={updateActiveFormatsAndLink}
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
            containerRef={liveContainerRef}
            bottomPadding={bottomPadding}
            disableHeavyPreview={disableHeavyPreview}
            className="flex-1 h-full p-4 sm:p-[27px] bg-card-bg select-text"
          />
        )}
      </div>

      {/* Stats & Backlinks Footer */}
      <div className="h-10 border-t border-border-theme bg-card-bg flex items-center justify-between px-3 sm:px-6 text-xs text-text-muted select-none shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <span>{wordCount} words</span>
          <span className="hidden sm:inline">{charCount} characters</span>
          <span className="hidden sm:inline">{readTime} min read</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          {/* Goal Indicator */}
          {wordGoal > 0 && (
            <div className="flex items-center gap-2">
              <span>Goal: {wordCount} / {wordGoal} words</span>
              <div
                className="w-24 h-1.5 bg-sidebar-bg rounded-full overflow-hidden"
                title={`${Math.min(100, Math.round((wordCount / wordGoal) * 100))}% completed`}
              >
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.min(100, (wordCount / wordGoal) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Backlinks Panel (§6.9) */}
          <BacklinksPanel notePath={notePath} onSelectNote={onSelectNote} />
        </div>
      </div>

      {/* Goal Modal */}
      {showGoalDialog && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleGoalSubmit}
            className="bg-card-bg border border-border-theme w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
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

      {/* Link Maker Modal (§6.3) */}
      {showLinkMaker && (
        <LinkMakerModal
          isOpen={showLinkMaker}
          onClose={() => setShowLinkMaker(false)}
          onSubmit={(markdown, replaceStart, replaceEnd) => {
            const textarea = textareaRef.current;
            const current = contentRef.current;
            const fallbackStart = savedSelectionRangeRef.current.start ?? 0;
            const fallbackEnd = savedSelectionRangeRef.current.end ?? 0;
            const sStart = replaceStart !== undefined ? replaceStart : (textarea?.selectionStart ?? fallbackStart);
            const sEnd = replaceEnd !== undefined ? replaceEnd : (textarea?.selectionEnd ?? fallbackEnd);

            const newContent = current.substring(0, sStart) + markdown + current.substring(sEnd);
            const newCursor = sStart + markdown.length;
            applyEdit(newContent, newCursor, newCursor);
          }}
          currentNotePath={notePath}
          currentContent={content}
          selectedText={
            textareaRef.current
              ? content.substring(textareaRef.current.selectionStart, textareaRef.current.selectionEnd)
              : ''
          }
          cursorOffset={textareaRef.current?.selectionStart || 0}
          existingLinkData={activeExistingLink}
          projects={projects}
          precheckEmbed={linkMakerEmbed}
          onAppendBlockIdToCurrentNote={(line, blockId) => {
            const lines = contentRef.current.split('\n');
            const lineIdx = line - 1;
            if (lineIdx >= 0 && lineIdx < lines.length) {
              lines[lineIdx] = `${lines[lineIdx].trimEnd()} ^${blockId}`;
              const updated = lines.join('\n');
              applyEdit(updated, textareaRef.current?.selectionStart, textareaRef.current?.selectionEnd);
            }
          }}
        />
      )}
    </div>
  );
}
