import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Eye, 
  Columns, 
  FileEdit, 
  Settings, 
  Target,
  Type
} from 'lucide-react';

interface EditorAreaProps {
  notePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  onSelectWikiLink: (noteName: string) => void;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

type EditMode = 'source' | 'split' | 'live';
type FontStyle = 'sans' | 'serif';



export default function EditorArea({
  notePath,
  initialContent,
  onSave,
  onSelectWikiLink,
  saveStatus
}: EditorAreaProps) {
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<EditMode>('split');
  const [fontStyle, setFontStyle] = useState<FontStyle>('serif');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('notes-font-style');
    if (saved) {
      setFontStyle(saved as FontStyle);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('notes-font-style', fontStyle);
  }, [fontStyle]);
  const [wordGoal, setWordGoal] = useState<number>(0);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);

  // Sync content when initialContent changes (switching notes)
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, notePath]);

  // Handle changes and trigger auto-save debounce
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    onSave(val);
  };

  // Preprocess WikiLinks [[Note Name]] to custom markdown anchors
  // e.g. [[My Note]] -> [My Note](#wikilink-My_Note)
  const preprocessMarkdown = (text: string) => {
    return text.replace(/\[\[(.*?)\]\]/g, (_, p1) => {
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

  // Custom markdown components for react-markdown
  const markdownComponents = {
    a: ({ href, children, ...props }: any) => {
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
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    }
  };

  // Format note path display
  const noteName = notePath.split('/').pop()?.replace('.md', '') || 'Untitled';
  const folderPath = notePath.split('/').slice(0, -1).join(' > ');

  return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden bg-card-bg">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-theme bg-card-bg z-10">
        <div className="flex items-center gap-1.5 text-xs text-text-muted truncate max-w-full">
          {folderPath && <span className="opacity-75">{folderPath} &gt; </span>}
          <span className="font-bold text-text-main text-sm">{noteName}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          {/* Save Status Indicator */}
          <span className="text-xs font-medium text-text-muted mr-1 select-none">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Draft saved'}
            {saveStatus === 'unsaved' && 'Unsaved changes'}
          </span>

          {/* Font Toggle */}
          <button 
            className="p-2 text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition" 
            title="Toggle Font Style (Serif/Sans)"
            onClick={() => setFontStyle(prev => prev === 'sans' ? 'serif' : 'sans')}
          >
            <Type size={16} />
          </button>

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
              <span className="hidden xs:inline">Source</span>
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
              <span className="hidden xs:inline">Split</span>
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
              <span className="hidden xs:inline">Live Preview</span>
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
              className={`w-full h-full resize-none p-10 bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'}`}
              value={content}
              onChange={handleChange}
              placeholder="Start writing in markdown..."
              autoFocus
            />
          </div>
        )}

        {mode === 'split' && (
          <div className="split-pane-layout">
            <div className="flex-1 h-full flex flex-col">
              <textarea
                ref={textareaRef}
                className={`w-full h-full resize-none p-10 bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'}`}
                value={content}
                onChange={handleChange}
                placeholder="Start writing in markdown..."
                autoFocus
              />
            </div>
            <div className="flex-1 h-full overflow-y-auto p-10 border-l border-border-theme bg-card-bg">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {preprocessMarkdown(content)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {mode === 'live' && (
          <div 
            ref={liveContainerRef}
            className="flex-1 h-full overflow-y-auto p-10 bg-card-bg cursor-text"
            onClick={() => setIsFocused(true)}
          >
            {isFocused ? (
              <textarea
                ref={textareaRef}
                className={`w-full h-full resize-none p-0 bg-transparent text-text-main placeholder-text-muted border-none outline-none focus:ring-0 overflow-y-auto ${fontStyle === 'serif' ? 'font-serif' : 'font-sans'}`}
                value={content}
                onChange={handleChange}
                onBlur={() => setIsFocused(false)}
                placeholder="Start writing in markdown..."
                autoFocus
              />
            ) : (
              <div className="markdown-body min-h-full">
                {content.trim() === '' ? (
                  <p className="text-text-muted italic select-none">Empty document. Click to start writing...</p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {preprocessMarkdown(content)}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="h-10 border-t border-border-theme bg-card-bg flex items-center justify-between px-6 text-xs text-text-muted select-none">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
          <span>{readTime} min read</span>
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
