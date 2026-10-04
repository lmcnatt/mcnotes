'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  SquareCode,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Table as TableIcon,
  Minus,
  Link2,
  ChevronDown,
} from 'lucide-react';

export interface ActiveFormats {
  headingLevel: number; // 0 for normal, 1-6 for H1-H6
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  codeBlock: boolean;
  quote: boolean;
  listType: 'bullet' | 'numbered' | 'checkbox' | null;
}

interface FormattingToolbarProps {
  activeFormats: ActiveFormats;
  onToggleFormat: (format: string, value?: any) => void;
  onInsertTable: (rows: number, cols: number) => void;
  onInsertHr: () => void;
  onOpenLinkMaker: (isEmbed?: boolean) => void;
}

export default function FormattingToolbar({
  activeFormats,
  onToggleFormat,
  onInsertTable,
  onInsertHr,
  onOpenLinkMaker,
}: FormattingToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [lastListType, setLastListType] = useState<'bullet' | 'numbered' | 'checkbox'>('bullet');
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [bottomOffset, setBottomOffset] = useState<number>(0);

  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown !== null) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [openDropdown]);

  // VisualViewport keyboard tracking for mobile
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const heightDiff = window.innerHeight - vv.height;
      if (heightDiff > 120) {
        // Keyboard is likely open on mobile
        setBottomOffset(Math.max(0, heightDiff));
      } else {
        setBottomOffset(0);
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  // Prevent default on pointer down so tapping buttons never dismisses mobile keyboard or blurs textarea
  const preventBlur = (e: React.PointerEvent) => {
    e.preventDefault();
  };

  const handleApplyHeading = (level: number) => {
    onToggleFormat('heading', level);
    setOpenDropdown(null);
  };

  const handleApplyList = (type: 'bullet' | 'numbered' | 'checkbox') => {
    setLastListType(type);
    onToggleFormat('list', type);
    setOpenDropdown(null);
  };

  const handleTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rows = Math.min(20, Math.max(1, tableRows));
    const cols = Math.min(10, Math.max(1, tableCols));
    onInsertTable(rows, cols);
    setOpenDropdown(null);
  };

  const headingLabel = activeFormats.headingLevel > 0 ? `H${activeFormats.headingLevel}` : 'H1';

  return (
    <div
      ref={toolbarRef}
      style={bottomOffset > 0 ? { transform: `translateY(-${bottomOffset}px)` } : undefined}
      className={`
        relative flex items-center gap-0.5 px-3 py-1.5 border-b border-border-theme bg-card-bg/95 backdrop-blur-md z-30 select-none overflow-visible
        transition-transform duration-100 ease-out
      `}
    >
      {/* 1. Heading Dropdown */}
      <div className="relative">
        <button
          type="button"
          onPointerDown={preventBlur}
          onClick={() => setOpenDropdown((cur) => (cur === 'heading' ? null : 'heading'))}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition ${activeFormats.headingLevel > 0
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-muted hover:text-text-main hover:bg-card-hover'
            }`}
          title="Headings (Ctrl/Cmd+Alt+1–6)"
        >
          <span>{headingLabel}</span>
          <ChevronDown size={11} className="opacity-60" />
        </button>

        {openDropdown === 'heading' && (
          <div className="absolute left-0 top-full mt-1 w-28 bg-card-bg border border-border-theme rounded-xl shadow-xl p-1 z-50 space-y-0.5 animate-in fade-in duration-100">
            {[1, 2, 3, 4, 5, 6].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onPointerDown={preventBlur}
                onClick={() => handleApplyHeading(lvl)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition ${activeFormats.headingLevel === lvl
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-main hover:bg-card-hover'
                  }`}
              >
                <span>H{lvl}</span>
                <span className="text-[10px] text-text-muted opacity-60">^{lvl}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-[1px] h-4 bg-border-theme/60 mx-1 shrink-0" />

      {/* 2. Bold */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onToggleFormat('bold')}
        className={`p-1.5 rounded-lg text-xs transition ${activeFormats.bold
            ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
            : 'text-text-muted hover:text-text-main hover:bg-card-hover'
          }`}
        title="Bold (Ctrl/Cmd+B)"
      >
        <Bold size={15} />
      </button>

      {/* 3. Italic */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onToggleFormat('italic')}
        className={`p-1.5 rounded-lg text-xs transition ${activeFormats.italic
            ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
            : 'text-text-muted hover:text-text-main hover:bg-card-hover'
          }`}
        title="Italic (Ctrl/Cmd+I)"
      >
        <Italic size={15} />
      </button>

      {/* 4. Underline */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onToggleFormat('underline')}
        className={`p-1.5 rounded-lg text-xs transition ${activeFormats.underline
            ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
            : 'text-text-muted hover:text-text-main hover:bg-card-hover'
          }`}
        title="Underline (Ctrl/Cmd+U)"
      >
        <Underline size={15} />
      </button>

      {/* 5. More Text Dropdown */}
      <div className="relative">
        <button
          type="button"
          onPointerDown={preventBlur}
          onClick={() => setOpenDropdown((cur) => (cur === 'more_text' ? null : 'more_text'))}
          className={`flex items-center gap-0.5 p-1.5 rounded-lg text-xs transition ${activeFormats.strikethrough || activeFormats.code
              ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
              : 'text-text-muted hover:text-text-main hover:bg-card-hover'
            }`}
          title="More Text Styles"
        >
          <Strikethrough size={15} />
          <ChevronDown size={11} className="opacity-60" />
        </button>

        {openDropdown === 'more_text' && (
          <div className="absolute left-0 top-full mt-1 w-36 bg-card-bg border border-border-theme rounded-xl shadow-xl p-1 z-50 space-y-0.5 animate-in fade-in duration-100">
            <button
              type="button"
              onPointerDown={preventBlur}
              onClick={() => {
                onToggleFormat('strikethrough');
                setOpenDropdown(null);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${activeFormats.strikethrough
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-text-main hover:bg-card-hover'
                }`}
            >
              <Strikethrough size={14} />
              <span>Strikethrough</span>
            </button>
            <button
              type="button"
              onPointerDown={preventBlur}
              onClick={() => {
                onToggleFormat('code');
                setOpenDropdown(null);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${activeFormats.code
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-text-main hover:bg-card-hover'
                }`}
            >
              <Code size={14} />
              <span>Inline Code</span>
            </button>
          </div>
        )}
      </div>

      <div className="w-[1px] h-4 bg-border-theme/60 mx-1 shrink-0" />

      {/* 6. Code Block */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onToggleFormat('codeBlock')}
        className={`hidden sm:inline-flex p-1.5 rounded-lg text-xs transition ${activeFormats.codeBlock
            ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
            : 'text-text-muted hover:text-text-main hover:bg-card-hover'
          }`}
        title="Code Block (```)"
      >
        <SquareCode size={15} />
      </button>

      {/* 7. Blockquote */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onToggleFormat('quote')}
        className={`p-1.5 rounded-lg text-xs transition ${activeFormats.quote
            ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
            : 'text-text-muted hover:text-text-main hover:bg-card-hover'
          }`}
        title="Blockquote (>)"
      >
        <Quote size={15} />
      </button>

      {/* 8. List Dropdown */}
      <div className="relative flex items-center">
        <button
          type="button"
          onPointerDown={preventBlur}
          onClick={() => handleApplyList(lastListType)}
          className={`p-1.5 rounded-l-lg text-xs transition ${activeFormats.listType
              ? 'bg-accent/15 text-accent border border-accent/30 font-bold'
              : 'text-text-muted hover:text-text-main hover:bg-card-hover'
            }`}
          title={`List: ${lastListType}`}
        >
          {lastListType === 'bullet' && <List size={15} />}
          {lastListType === 'numbered' && <ListOrdered size={15} />}
          {lastListType === 'checkbox' && <CheckSquare size={15} />}
        </button>
        <button
          type="button"
          onPointerDown={preventBlur}
          onClick={() => setOpenDropdown((cur) => (cur === 'list' ? null : 'list'))}
          className="p-1 -ml-1 rounded-r-lg text-text-muted hover:text-text-main hover:bg-card-hover transition"
        >
          <ChevronDown size={11} className="opacity-60" />
        </button>

        {openDropdown === 'list' && (
          <div className="absolute left-0 top-full mt-1 w-36 bg-card-bg border border-border-theme rounded-xl shadow-xl p-1 z-50 space-y-0.5 animate-in fade-in duration-100">
            <button
              type="button"
              onPointerDown={preventBlur}
              onClick={() => handleApplyList('bullet')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${activeFormats.listType === 'bullet'
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-text-main hover:bg-card-hover'
                }`}
            >
              <List size={14} />
              <span>Bullet List</span>
            </button>
            <button
              type="button"
              onPointerDown={preventBlur}
              onClick={() => handleApplyList('numbered')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${activeFormats.listType === 'numbered'
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-text-main hover:bg-card-hover'
                }`}
            >
              <ListOrdered size={14} />
              <span>Numbered List</span>
            </button>
            <button
              type="button"
              onPointerDown={preventBlur}
              onClick={() => handleApplyList('checkbox')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${activeFormats.listType === 'checkbox'
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-text-main hover:bg-card-hover'
                }`}
            >
              <CheckSquare size={14} />
              <span>Task List (Ctrl+L)</span>
            </button>
          </div>
        )}
      </div>

      <div className="w-[1px] h-4 bg-border-theme/60 mx-1 shrink-0" />

      {/* 9. Table Popover */}
      <div className="relative">
        <button
          type="button"
          onPointerDown={preventBlur}
          onClick={() => setOpenDropdown((cur) => (cur === 'table' ? null : 'table'))}
          className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-main hover:bg-card-hover transition"
          title="Insert Table"
        >
          <TableIcon size={15} />
        </button>

        {openDropdown === 'table' && (
          <form
            onSubmit={handleTableSubmit}
            className="absolute left-0 top-full mt-1 w-48 bg-card-bg border border-border-theme rounded-xl shadow-xl p-3 z-50 space-y-2.5 animate-in fade-in duration-100"
          >
            <div className="text-xs font-bold text-text-main">Insert Table</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-text-muted">Rows</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tableRows}
                  onChange={(e) => setTableRows(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 bg-app-bg border border-border-theme rounded-lg text-xs text-text-main"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-muted">Columns</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={tableCols}
                  onChange={(e) => setTableCols(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-1 bg-app-bg border border-border-theme rounded-lg text-xs text-text-main"
                />
              </div>
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onPointerDown={preventBlur}
                onClick={() => setOpenDropdown(null)}
                className="px-2 py-1 text-[11px] font-semibold text-text-muted hover:text-text-main rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                onPointerDown={preventBlur}
                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition shadow-sm"
              >
                Insert
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 10. Horizontal Rule */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={onInsertHr}
        className="hidden sm:inline-flex p-1.5 rounded-lg text-xs text-text-muted hover:text-text-main hover:bg-card-hover transition"
        title="Horizontal Rule (---)"
      >
        <Minus size={15} />
      </button>

      {/* 11. Link */}
      <button
        type="button"
        onPointerDown={preventBlur}
        onClick={() => onOpenLinkMaker(false)}
        className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-main hover:bg-card-hover transition"
        title="Insert Link (Ctrl/Cmd+K) / Embed (Ctrl/Cmd+Shift+E)"
      >
        <Link2 size={15} />
      </button>
    </div>
  );
}
