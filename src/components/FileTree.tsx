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
  ChevronDown 
} from 'lucide-react';
import { FileNode } from '@/lib/notes';

interface FileTreeProps {
  tree: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreateItem: (type: 'file' | 'directory', parentPath: string) => void;
  onRenameItem: (oldPath: string, newPath: string) => void;
  onDeleteItem: (path: string) => void;
}

export default function FileTree({
  tree,
  selectedPath,
  onSelect,
  onCreateItem,
  onRenameItem,
  onDeleteItem
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedOverPath, setDraggedOverPath] = useState<string | null>(null);

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

    const draggedPath = e.dataTransfer.getData('text/plain');
    if (!draggedPath || draggedPath === targetNode.relativePath) return;

    let targetFolder = '';
    if (targetNode.isDirectory) {
      targetFolder = targetNode.relativePath;
    } else {
      const lastSlash = targetNode.relativePath.lastIndexOf('/');
      targetFolder = lastSlash === -1 ? '' : targetNode.relativePath.substring(0, lastSlash);
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

    const draggedPath = e.dataTransfer.getData('text/plain');
    if (!draggedPath) return;

    if (!draggedPath.includes('/')) return;

    const fileName = draggedPath.split('/').pop()!;
    onRenameItem(draggedPath, fileName);
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const startRename = (node: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(node.relativePath);
    setEditName(node.name.replace('.md', ''));
  };

  const finishRename = (node: FileNode) => {
    if (editName.trim() && editName !== node.name.replace('.md', '')) {
      const parent = node.relativePath.substring(0, node.relativePath.lastIndexOf('/'));
      const newRelativePath = parent ? `${parent}/${editName}` : editName;
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
        <div key={node.relativePath} className="tree-node">
          <div 
            className={`node-row ${isSelected ? 'selected' : ''} ${draggedOverPath === node.relativePath ? 'drag-over' : ''}`}
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
            {isExpanded ? (
              <ChevronDown size={16} className="text-muted" />
            ) : (
              <ChevronRight size={16} className="text-muted" />
            )}
            
            {isExpanded ? (
              <FolderOpen size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
            ) : (
              <Folder size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
            )}
            
            {isEditing ? (
              <input
                type="text"
                className="inline-input"
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
              <span className="node-label">{node.name}</span>
            )}

            <div className="node-actions" onClick={e => e.stopPropagation()}>
              <button 
                className="node-action-btn"
                title="New Note"
                onClick={() => onCreateItem('file', node.relativePath)}
              >
                <Plus size={14} />
              </button>
              <button 
                className="node-action-btn"
                title="New Subfolder"
                onClick={() => onCreateItem('directory', node.relativePath)}
              >
                <FolderPlus size={14} />
              </button>
              <button 
                className="node-action-btn"
                title="Rename folder"
                onClick={e => startRename(node, e)}
              >
                <Edit3 size={14} />
              </button>
              <button 
                className="node-action-btn"
                title="Delete folder"
                onClick={() => onDeleteItem(node.relativePath)}
              >
                <Trash size={14} />
              </button>
            </div>
          </div>
          
          {isExpanded && node.children && (
            <div className="folder-children" style={{ borderLeft: '1px solid var(--border)', marginLeft: '10px' }}>
              {node.children.map(child => renderNode(child))}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div 
          key={node.relativePath}
          className={`node-row ${isSelected ? 'selected' : ''} ${draggedOverPath === node.relativePath ? 'drag-over' : ''}`}
          onClick={() => onSelect(node.relativePath)}
          style={{ paddingLeft: '24px' }}
          draggable
          onDragStart={(e) => handleDragStart(e, node.relativePath)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
        >
          <FileText size={16} className="text-muted" />
          
          {isEditing ? (
            <input
              type="text"
              className="inline-input"
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
            <span className="node-label">{node.name.replace('.md', '')}</span>
          )}

          <div className="node-actions" onClick={e => e.stopPropagation()}>
            <button 
              className="node-action-btn"
              title="Rename file"
              onClick={e => startRename(node, e)}
            >
              <Edit3 size={14} />
            </button>
            <button 
              className="node-action-btn"
              title="Delete file"
              onClick={() => onDeleteItem(node.relativePath)}
            >
              <Trash size={14} />
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div 
      className="tree-container"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropAtRoot}
    >
      {tree.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          No notes yet. Click "+" below to start.
        </div>
      ) : (
        tree.map(node => renderNode(node))
      )}
    </div>
  );
}
