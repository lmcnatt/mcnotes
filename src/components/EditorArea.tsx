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

const WYSIWYGEditor = ({ 
  content, 
  onChange, 
  fontStyle 
}: { 
  content: string; 
  onChange: (val: string) => void; 
  fontStyle: string;
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isEditing = useRef(false);

  // Parse raw markdown to styled DIV lines on mount/note change
  useEffect(() => {
    if (editorRef.current && !isEditing.current) {
      const lines = content.split('\n');
      const html = lines.map(line => {
        let lineClass = "live-editor-line";
        if (line.startsWith('# ')) lineClass += " live-h1";
        else if (line.startsWith('## ')) lineClass += " live-h2";
        else if (line.startsWith('### ')) lineClass += " live-h3";
        else if (line.startsWith('> ')) lineClass += " live-blockquote";
        return `<div class="${lineClass}">${line === '' ? '<br>' : line}</div>`;
      }).join('');
      editorRef.current.innerHTML = html;
    }
  }, [content]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    isEditing.current = true;
    
    const container = e.currentTarget;
    
    // Dynamically update class names of DOM children based on markdown prefixes
    Array.from(container.children).forEach(child => {
      const el = child as HTMLElement;
      const text = el.innerText || '';
      
      let lineClass = "live-editor-line";
      if (text.startsWith('# ')) lineClass += " live-h1";
      else if (text.startsWith('## ')) lineClass += " live-h2";
      else if (text.startsWith('### ')) lineClass += " live-h3";
      else if (text.startsWith('> ')) lineClass += " live-blockquote";
      
      if (el.className !== lineClass) {
        el.className = lineClass;
      }
    });

    const rawMarkdown = container.innerText || '';
    onChange(rawMarkdown.replace(/\r\n/g, '\n'));
  };

  const handleBlur = () => {
    isEditing.current = false;
  };

  return (
    <div 
      ref={editorRef}
      className={`markdown-body ${fontStyle}`}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      style={{ 
        flex: 1, 
        padding: '40px', 
        overflowY: 'auto', 
        backgroundColor: 'var(--bg-card)', 
        outline: 'none',
        height: '100%',
        minHeight: '100%'
      }}
    />
  );
};

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
    <div className="workspace">
      {/* Workspace Header */}
      <div className="workspace-header">
        <div className="note-path">
          {folderPath && <span>{folderPath} &gt; </span>}
          <span className="note-title-active">{noteName}</span>
        </div>

        <div className="workspace-actions">
          {/* Save Status Indicator */}
          <span className="save-indicator">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Draft saved'}
            {saveStatus === 'unsaved' && 'Unsaved changes'}
          </span>

          {/* Font Toggle */}
          <button 
            className="btn-icon" 
            title="Toggle Font Style (Serif/Sans)"
            onClick={() => setFontStyle(prev => prev === 'sans' ? 'serif' : 'sans')}
          >
            <Type size={16} />
          </button>

          {/* Goal Setting */}
          <button 
            className="btn-icon" 
            title="Set Word Goal"
            onClick={() => {
              setGoalInput(wordGoal > 0 ? wordGoal.toString() : '');
              setShowGoalDialog(true);
            }}
          >
            <Target size={16} style={{ color: wordGoal > 0 ? 'var(--accent)' : 'inherit' }} />
          </button>

          {/* Mode Selector */}
          <div className="mode-selector">
            <button 
              className={`mode-btn ${mode === 'source' ? 'active' : ''}`}
              onClick={() => setMode('source')}
              title="Markdown Source"
            >
              <FileEdit size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Source
            </button>
            <button 
              className={`mode-btn ${mode === 'split' ? 'active' : ''}`}
              onClick={() => setMode('split')}
              title="Split Screen"
            >
              <Columns size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Split
            </button>
            <button 
              className={`mode-btn ${mode === 'live' ? 'active' : ''}`}
              onClick={() => setMode('live')}
              title="Live Preview"
            >
              <Eye size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Live Preview
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="editor-container">
        {mode === 'source' && (
          <div className="editor-pane">
            <textarea
              ref={textareaRef}
              className={`editor-textarea ${fontStyle}`}
              value={content}
              onChange={handleChange}
              placeholder="Start writing in markdown..."
              autoFocus
            />
          </div>
        )}

        {mode === 'split' && (
          <div className="split-pane-layout">
            <div className="editor-pane">
              <textarea
                ref={textareaRef}
                className={`editor-textarea ${fontStyle}`}
                value={content}
                onChange={handleChange}
                placeholder="Start writing in markdown..."
                autoFocus
              />
            </div>
            <div className="preview-pane">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {preprocessMarkdown(content)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {mode === 'live' && (
          <WYSIWYGEditor 
            content={content}
            onChange={(val) => {
              setContent(val);
              onSave(val);
            }}
            fontStyle={fontStyle}
          />
        )}
      </div>

      {/* Stats Footer */}
      <div className="workspace-footer">
        <div className="stats-group">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
          <span>{readTime} min read</span>
        </div>

        {wordGoal > 0 && (
          <div className="goal-tracker">
            <span>Goal: {wordCount} / {wordGoal} words</span>
            <div className="progress-bar-bg" title={`${Math.min(100, Math.round((wordCount / wordGoal) * 100))}% completed`}>
              <div 
                className="progress-bar-fg" 
                style={{ width: `${Math.min(100, (wordCount / wordGoal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Goal Modal */}
      {showGoalDialog && (
        <div className="dialog-overlay">
          <form onSubmit={handleGoalSubmit} className="dialog">
            <div className="dialog-title">Set Writing Word Goal</div>
            <div className="form-group">
              <label className="form-label">Target Word Count (0 to disable)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 1000"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                autoFocus
                min="0"
              />
            </div>
            <div className="dialog-actions">
              <button 
                type="button" 
                className="dialog-btn cancel"
                onClick={() => setShowGoalDialog(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="dialog-btn confirm"
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
