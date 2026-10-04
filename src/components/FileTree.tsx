import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  FolderPlus,
  Trash, 
  Edit3, 
  ChevronRight, 
  ChevronDown,
  MoreHorizontal
} from 'lucide-react';
import type { FileNode } from '@/lib/notes';
import { useEffect, useRef } from 'react';

interface FileTreeProps {
  tree: FileNode[];
  selectedPath: string | null;
  rootPath?: string;
  expandedFolders?: Record<string, boolean>;
  onToggleFolder?: (path: string) => void;
  onSelect: (path: string) => void;
  onCreateItem: (type: 'file' | 'directory', parentPath: string) => void;
  onRenameItem: (oldPath: string, newPath: string) => void;
  onDeleteItem: (path: string) => void;
  onSetEmoji?: (path: string, emoji: string) => void;
}

const getFolderIcon = (node: FileNode, isExpanded: boolean) => {
  if (node.emoji) {
    return <span style={{ fontSize: '16px', marginRight: '4px', display: 'inline-flex', alignItems: 'center' }}>{node.emoji}</span>;
  }
  const match = node.name.match(/^(\p{Extended_Pictographic})/u);
  if (match) {
    return <span style={{ fontSize: '16px', marginRight: '4px', display: 'inline-flex', alignItems: 'center' }}>{match[1]}</span>;
  }
  return isExpanded ? (
    <FolderOpen size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
  ) : (
    <Folder size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
  );
};

const getFolderDisplayName = (name: string): string => {
  const match = name.match(/^(\p{Extended_Pictographic})/u);
  if (match) {
    return name.replace(match[1], '').trim();
  }
  return name;
};

export default function FileTree({
  tree,
  selectedPath,
  rootPath = '',
  expandedFolders: propExpandedFolders,
  onToggleFolder: propOnToggleFolder,
  onSelect,
  onCreateItem,
  onRenameItem,
  onDeleteItem,
  onSetEmoji
}: FileTreeProps) {
  const [internalExpandedFolders, setInternalExpandedFolders] = useState<Record<string, boolean>>({});
  const expandedFolders = propExpandedFolders !== undefined ? propExpandedFolders : internalExpandedFolders;

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedOverPath, setDraggedOverPath] = useState<string | null>(null);
  const [activeEmojiPickerPath, setActiveEmojiPickerPath] = useState<string | null>(null);
  const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const getParentPath = (value: string) => {
    const normalized = normalizePath(value);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash === -1 ? '' : normalized.substring(0, lastSlash);
  };

  useEffect(() => {
    if (propExpandedFolders === undefined) {
      const saved = localStorage.getItem('notes-expanded-folders');
      if (saved) {
        try {
          setInternalExpandedFolders(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [propExpandedFolders]);

  // Section 4: Auto-scroll sidebar when selected note changes
  useEffect(() => {
    if (!selectedPath || !containerRef.current) return;
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const el = containerRef.current.querySelector(`[data-tree-path="${CSS.escape(selectedPath)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedPath]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveEmojiPickerPath(null);
      setMobileMenuPath(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const toggleEmojiPicker = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeEmojiPickerPath === path) {
      setActiveEmojiPickerPath(null);
    } else {
      setActiveEmojiPickerPath(path);
      setPickerPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleSelectEmoji = (path: string, emoji: string) => {
    if (onSetEmoji) {
      onSetEmoji(path, emoji);
    }
    setActiveEmojiPickerPath(null);
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetNode: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetNode.relativePath !== draggedOverPath) {
      setDraggedOverPath(targetNode.relativePath);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOverPath(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverPath(null);

    const draggedPath = normalizePath(e.dataTransfer.getData('text/plain'));
    const targetPath = normalizePath(targetNode.relativePath);
    if (!draggedPath || draggedPath === targetPath) return;

    let targetFolder = '';
    if (targetNode.isDirectory) {
      targetFolder = targetPath;
    } else {
      targetFolder = getParentPath(targetPath);
    }

    if (targetFolder === draggedPath || targetFolder.startsWith(draggedPath + '/')) {
      alert("Cannot move a folder inside itself or its own subfolders.");
      return;
    }

    const fileName = draggedPath.split('/').pop()!;
    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    if (draggedPath !== newPath) {
      onRenameItem(draggedPath, newPath);
    }
  };

  const handleDropAtRoot = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOverPath(null);

    const draggedPath = normalizePath(e.dataTransfer.getData('text/plain'));
    if (!draggedPath) return;

    if (!draggedPath.includes('/')) return;

    const fileName = draggedPath.split('/').pop()!;
    const targetRoot = normalizePath(rootPath);
    const targetPath = targetRoot ? `${targetRoot}/${fileName}` : fileName;
    if (draggedPath !== targetPath) {
      onRenameItem(draggedPath, targetPath);
    }
  };

  const toggleFolder = (path: string) => {
    if (propOnToggleFolder) {
      propOnToggleFolder(path);
    } else {
      setInternalExpandedFolders(prev => {
        const next = { ...prev, [path]: !prev[path] };
        localStorage.setItem('notes-expanded-folders', JSON.stringify(next));
        return next;
      });
    }
  };

  const startRename = (node: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(node.relativePath);
    setEditName(node.name.replace('.md', ''));
  };

  const finishRename = (node: FileNode) => {
    if (editName.trim() && editName !== node.name.replace('.md', '')) {
      // Replace forward slash with fraction slash (⁄ U+2044) to prevent unintended folder creation
      const safeName = editName.replace(/\//g, '\u2044');
      const parent = node.relativePath.substring(0, node.relativePath.lastIndexOf('/'));
      const newRelativePath = parent ? `${parent}/${safeName}` : safeName;
      onRenameItem(node.relativePath, newRelativePath);
    }
    setEditingPath(null);
  };

  const renderNode = (node: FileNode) => {
    const isExpanded = expandedFolders[node.relativePath] || false;
    const isSelected = selectedPath === node.relativePath;
    const isEditing = editingPath === node.relativePath;

    if (node.isDirectory) {
      return (
        <div key={node.relativePath} className="w-full">
          <div 
            data-tree-path={node.relativePath}
            className={`
              group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all duration-150
              ${isSelected ? 'bg-card-bg font-medium shadow-sm border border-border-theme/40' : 'hover:bg-card-hover text-text-muted hover:text-text-main'}
              ${draggedOverPath === node.relativePath ? 'bg-accent/10 border border-dashed border-accent' : ''}
            `}
            onClick={() => {
              toggleFolder(node.relativePath);
              onSelect(node.relativePath);
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, node.relativePath)}
            onDragOver={(e) => handleDragOver(e, node)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node)}
          >
            <div className="flex items-center justify-center w-4 h-4">
              {isExpanded ? (
                <ChevronDown size={14} className="opacity-70" />
              ) : (
                <ChevronRight size={14} className="opacity-70" />
              )}
            </div>
            
            <span 
              onClick={(e) => toggleEmojiPicker(node.relativePath, e)}
              className="inline-flex items-center justify-center p-0.5 rounded hover:bg-border transition"
              title="Click to change folder icon/emoji"
            >
              {getFolderIcon(node, isExpanded)}
            </span>
            
            {isEditing ? (
              <input
                type="text"
                className="bg-app-bg border border-accent rounded px-1.5 py-0.5 text-sm text-text-main focus:outline-none w-full max-w-[150px]"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => finishRename(node)}
                onKeyDown={e => {
                  if (e.key === 'Enter') finishRename(node);
                  if (e.key === 'Escape') setEditingPath(null);
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm truncate select-none min-w-0" title={getFolderDisplayName(node.name)}>{getFolderDisplayName(node.name)}</span>
            )}

            <div className="ml-auto pl-1 flex items-center lg:contents" onClick={e => e.stopPropagation()}>
              {/* ⋮ button — mobile only, always visible */}
              <button
                className="lg:hidden p-1.5 rounded text-text-muted active:text-text-main transition"
                onClick={e => { e.stopPropagation(); setMobileMenuPath(prev => prev === node.relativePath ? null : node.relativePath); }}
              >
                <MoreHorizontal size={15} />
              </button>
              {/* Actions: appear on hover (desktop) or when ⋮ tapped (mobile) */}
              <div
                className={`flex items-center gap-0.5 lg:absolute lg:right-1 lg:top-1/2 lg:-translate-y-1/2 lg:pl-1 lg:rounded lg:opacity-0 lg:pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto lg:transition-opacity ${isSelected ? 'lg:bg-card-bg' : 'lg:bg-card-hover'} ${
                  mobileMenuPath === node.relativePath ? 'flex' : 'hidden lg:flex'
                }`}
              >
                <button
                  className="p-1 text-text-muted hover:text-accent hover:bg-card-bg rounded transition"
                  title="New Note"
                  onClick={() => { onCreateItem('file', node.relativePath); setMobileMenuPath(null); }}
                >
                  <Plus size={12} />
                </button>
                <button
                  className="p-1 text-text-muted hover:text-accent hover:bg-card-bg rounded transition"
                  title="New Subfolder"
                  onClick={() => { onCreateItem('directory', node.relativePath); setMobileMenuPath(null); }}
                >
                  <FolderPlus size={12} />
                </button>
                <button
                  className="p-1 text-text-muted hover:text-accent hover:bg-card-bg rounded transition"
                  title="Rename folder"
                  onClick={e => { startRename(node, e); setMobileMenuPath(null); }}
                >
                  <Edit3 size={12} />
                </button>
                <button
                  className="p-1 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition"
                  title="Delete folder"
                  onClick={() => { onDeleteItem(node.relativePath); setMobileMenuPath(null); }}
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>
          </div>
          
          {isExpanded && node.children && (
            <div className="pl-4 border-l border-border-theme/30 ml-5 space-y-0.5 mt-0.5">
              {node.children.map(child => renderNode(child))}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div 
          key={node.relativePath}
          data-tree-path={node.relativePath}
          className={`
            group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all duration-150
            ${isSelected ? 'bg-card-bg font-medium shadow-sm border border-border-theme/40 text-accent' : 'hover:bg-card-hover text-text-muted hover:text-text-main'}
            ${draggedOverPath === node.relativePath ? 'bg-accent/10 border border-dashed border-accent' : ''}
          `}
          onClick={() => onSelect(node.relativePath)}
          style={{ paddingLeft: '28px' }}
          draggable
          onDragStart={(e) => handleDragStart(e, node.relativePath)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
        >
          <FileText size={14} className="opacity-70" />
          
          {isEditing ? (
            <input
              type="text"
              className="bg-app-bg border border-accent rounded px-1.5 py-0.5 text-sm text-text-main focus:outline-none w-full max-w-[150px]"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={() => finishRename(node)}
              onKeyDown={e => {
                if (e.key === 'Enter') finishRename(node);
                if (e.key === 'Escape') setEditingPath(null);
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm truncate select-none min-w-0" title={node.name.replace('.md', '')}>{node.name.replace('.md', '')}</span>
          )}

          <div className="ml-auto pl-1 flex items-center lg:contents" onClick={e => e.stopPropagation()}>
            {/* ⋮ button — mobile only, always visible */}
            <button
              className="lg:hidden p-1.5 rounded text-text-muted active:text-text-main transition"
              onClick={e => { e.stopPropagation(); setMobileMenuPath(prev => prev === node.relativePath ? null : node.relativePath); }}
            >
              <MoreHorizontal size={15} />
            </button>
            {/* Actions: appear on hover (desktop) or when ⋮ tapped (mobile) */}
            <div
              className={`flex items-center gap-0.5 lg:absolute lg:right-1 lg:top-1/2 lg:-translate-y-1/2 lg:pl-1 lg:rounded lg:opacity-0 lg:pointer-events-none lg:group-hover:opacity-100 lg:group-hover:pointer-events-auto lg:transition-opacity ${isSelected ? 'lg:bg-card-bg' : 'lg:bg-card-hover'} ${
                mobileMenuPath === node.relativePath ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <button
                className="p-1 text-text-muted hover:text-accent hover:bg-card-bg rounded transition"
                title="Rename file"
                onClick={e => { startRename(node, e); setMobileMenuPath(null); }}
              >
                <Edit3 size={12} />
              </button>
              <button
                className="p-1 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition"
                title="Delete file"
                onClick={() => { onDeleteItem(node.relativePath); setMobileMenuPath(null); }}
              >
                <Trash size={12} />
              </button>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-0.5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropAtRoot}
    >
      {tree.length === 0 ? (
        <div className="py-8 text-center text-xs text-text-muted">
          No notes yet. Click "New Note" above to start.
        </div>
      ) : (
        tree.map(node => renderNode(node))
      )}

      {activeEmojiPickerPath && (
        <div 
          className="fixed z-50 w-56 p-3 rounded-xl border border-border-theme bg-card-bg shadow-xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{
            left: `${Math.min(window.innerWidth - 240, pickerPosition.x)}px`,
            top: `${Math.min(window.innerHeight - 250, pickerPosition.y + 10)}px`,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-text-muted">
            Set Folder Icon (Emoji)
          </div>
          
          <input
            type="text"
            placeholder="Type or paste emoji..."
            className="w-full text-center text-sm py-1.5 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg focus:outline-none transition"
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val) {
                handleSelectEmoji(activeEmojiPickerPath, val);
              }
            }}
            autoFocus
          />
          
          <div className="text-[10px] text-text-muted text-center leading-normal">
            Press <b>Win + .</b> or <b>Cmd + Ctrl + Space</b> to open system panel
          </div>

          <div className="flex flex-wrap gap-1.5 justify-center border-t border-border-theme/40 pt-2.5">
            {['📖', '📚', '✍️', '📂', '💡', '📝', '📓', '🎨', '🎭', '🎬', '🚀', '📅', '📌', '📁', '❤️', '🔍', '⭐', '🔥'].map(emoji => (
              <button
                key={emoji}
                onClick={() => handleSelectEmoji(activeEmojiPickerPath, emoji)}
                className="text-lg p-1 rounded hover:bg-app-bg active:scale-95 transition"
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            className="w-full text-xs text-text-muted hover:text-red-500 border-t border-border-theme/40 pt-2 mt-1 transition"
            onClick={() => handleSelectEmoji(activeEmojiPickerPath, '')}
          >
            Remove Icon
          </button>
        </div>
      )}
    </div>
  );
}
