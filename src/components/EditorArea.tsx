import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Eye, 
  Columns, 
  FileEdit,
  Target,
  Undo2,
  Redo2
} from 'lucide-react';

interface EditorAreaProps {
  notePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  onSelectWikiLink: (noteName: string) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

type EditMode = 'source' | 'split' | 'live';

export default function EditorArea({
  notePath,
  initialContent,
  onSave,
  onSelectWikiLink,
  saveStatus
}: EditorAreaProps) {
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<EditMode>('source');
  const [isMobile, setIsMobile] = useState(false);
  const [wordGoal, setWordGoal] = useState<number>(0);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const scrollRatioRef = useRef<number>(0);


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
    if (initialContent !== content) {
      setContent(initialContent);
    }
  }, [initialContent, content]);

  // Handle changes and trigger auto-save debounce
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val !== content) {
      undoStackRef.current.push(content);
      // Keep history bounded to avoid unbounded memory growth.
      if (undoStackRef.current.length > 200) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(false);
    }
    setContent(val);
    onSave(val);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop();
    if (previous === undefined) return;

    redoStackRef.current.push(content);
    setContent(previous);
    onSave(previous);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    if (next === undefined) return;

    undoStackRef.current.push(content);
    setContent(next);
    onSave(next);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (key === 'u' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleUnderlineShortcut();
      return;
    }
  };

  const handleUnderlineShortcut = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    let newContent = '';
    let newCursorStart = start;
    let newCursorEnd = end;

    if (selectedText.length > 0) {
      if (selectedText.startsWith('++') && selectedText.endsWith('++') && selectedText.length >= 4) {
        const unwrapped = selectedText.slice(2, -2);
        newContent = content.substring(0, start) + unwrapped + content.substring(end);
        newCursorStart = start;
        newCursorEnd = start + unwrapped.length;
      } else {
        const wrapped = `++${selectedText}++`;
        newContent = content.substring(0, start) + wrapped + content.substring(end);
        newCursorStart = start;
        newCursorEnd = start + wrapped.length;
      }
    } else {
      newContent = content.substring(0, start) + '++++' + content.substring(end);
      newCursorStart = start + 2;
      newCursorEnd = start + 2;
    }

    undoStackRef.current.push(content);
    if (undoStackRef.current.length > 200) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);

    setContent(newContent);
    onSave(newContent);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorStart, newCursorEnd);
      }
    });
  };

  // Scroll synchronization handlers
  const handleSourceScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll > 0) {
      scrollRatioRef.current = target.scrollTop / maxScroll;
    }
  };

  const handlePreviewScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll > 0) {
      scrollRatioRef.current = target.scrollTop / maxScroll;
    }
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

  // Preprocess underline syntax (++text++ and <u>text</u>) and WikiLinks [[Note Name]]
  const preprocessMarkdown = (text: string) => {
    const withUnderline = text
      .replace(/<u>([\s\S]*?)<\/u>/gi, '[$1](#u)')
      .replace(/\+\+([\s\S]*?)\+\+/g, '[$1](#u)');

    return withUnderline.replace(/\[\[(.*?)\]\]/g, (_, p1) => {
      const slug = p1.trim().replace(/\s+/g, '_');
      return `[${p1.trim()}](#wikilink-${slug})`;
    });
  };


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
  const readTime = Math.ceil(wordCount / 200); // 200 words per minute average
  const disableHeavyPreview = isMobile && content.length > 120000;

  const handleWikiLinkClick = (slug: string) => {
    const originalName = slug.replace(/_/g, ' ');
    onSelectWikiLink(originalName);
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(goalInput);
    if (!isNaN(val) && val >= 0) {
      setWordGoal(val);
    }
    setShowGoalDialog(false);
  };

  // Helper to extract text from React children nodes
  const getNodeText = (node: React.ReactNode): string => {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join('');
    if (React.isValidElement(node) && (node.props as { children?: React.ReactNode })?.children) {
      return getNodeText((node.props as { children?: React.ReactNode }).children);
    }
    return '';
  };

  // Custom markdown components for react-markdown
  const markdownComponents = {
    a: ({ href, children, node: _node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
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
              handleWikiLinkClick(slug);
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
              const targetElem = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`);
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
    h1: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h1 id={id} {...props}>{children}</h1>;
    },
    h2: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h2 id={id} {...props}>{children}</h2>;
    },
    h3: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h3 id={id} {...props}>{children}</h3>;
    },
    h4: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h4 id={id} {...props}>{children}</h4>;
    },
    h5: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h5 id={id} {...props}>{children}</h5>;
    },
    h6: ({ children, node: _node, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const id = getNodeText(children).toLowerCase().trim().replace(/[^\w]+/g, '-');
      return <h6 id={id} {...props}>{children}</h6>;
    },
  };

  // Format note path display
  const noteName = notePath.split('/').pop()?.replace('.md', '') || 'Untitled';
  const folderPath = notePath.split('/').slice(0, -1).join(' > ');

  return (
    <div ref={editorContainerRef} className="flex flex-col flex-1 h-full w-full overflow-hidden bg-card-bg">
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
              className="w-full h-full resize-none p-6 sm:p-10 bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto"
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
                className="w-full h-full resize-none p-6 sm:p-10 bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto"
                value={content}
                onChange={handleChange}
                onKeyDown={handleEditorKeyDown}
                onScroll={handleSourceScroll}
                placeholder="Start writing in markdown..."
              />
            </div>
            <div 
              onScroll={handlePreviewScroll}
              className="flex-1 min-h-0 h-1/2 lg:h-full overflow-y-auto p-6 sm:p-10 border-t lg:border-t-0 lg:border-l border-border-theme bg-card-bg"
            >
              {disableHeavyPreview ? (
                <div className="h-full flex items-center justify-center text-sm text-text-muted text-center px-4">
                  Preview is disabled on mobile for very large files. Use Source mode to edit.
                </div>
              ) : (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {preprocessMarkdown(content)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'live' && (
          <div 
            ref={liveContainerRef}
            onScroll={handlePreviewScroll}
            className="flex-1 h-full overflow-y-auto p-6 sm:p-10 bg-card-bg select-text"
          >
            <div className="markdown-body min-h-full">
              {content.trim() === '' ? (
                <p className="text-text-muted italic select-none">Empty document.</p>
              ) : disableHeavyPreview ? (
                <p className="text-text-muted select-none">Preview is disabled on mobile for very large files. Use Source mode to edit.</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {preprocessMarkdown(content)}
                </ReactMarkdown>
              )}
            </div>
          </div>
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
                onChange={e => setGoalInput(e.target.value)}
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
