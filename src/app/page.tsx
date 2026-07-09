'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FolderPlus, 
  FilePlus, 
  Search, 
  LogOut, 
  Sun, 
  Moon, 
  Coffee,
  Loader
} from 'lucide-react';
import FileTree from '@/components/FileTree';
import EditorArea from '@/components/EditorArea';
import { FileNode } from '@/lib/notes';

type Theme = 'sepia' | 'light' | 'dark';

interface SearchResult {
  relativePath: string;
  title: string;
  matches: { line: number; text: string }[];
}

export default function Dashboard() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [username, setUsername] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [loadingNote, setLoadingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [theme, setTheme] = useState<Theme>('sepia');
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Modals state
  const [modalType, setModalType] = useState<'create_file' | 'create_folder' | 'delete' | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [targetPath, setTargetPath] = useState<string>('');

  const router = useRouter();
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const latestContent = useRef<string>('');

  // Fetch file tree and user info on mount
  const fetchTree = async () => {
    try {
      const res = await fetch('/api/notes');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      setTree(data.tree);
      setUsername(data.username);
    } catch (err) {
      console.error('Failed to load notes tree:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('notes-theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  // Handle Theme switching
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('notes-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Open note and load content
  const handleSelectNote = async (path: string) => {
    // If a directory was clicked, we don't load content
    const findNode = (nodes: FileNode[], target: string): FileNode | null => {
      for (const node of nodes) {
        if (node.relativePath === target) return node;
        if (node.children) {
          const found = findNode(node.children, target);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(tree, path);
    if (node?.isDirectory) return;

    // Save active note if unsaved before switching
    if (saveStatus === 'unsaved' && selectedPath) {
      await saveNoteContent(selectedPath, latestContent.current);
    }

    setLoadingNote(true);
    setSelectedPath(path);
    setSaveStatus('saved');

    try {
      const res = await fetch(`/api/notes/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok) {
        setNoteContent(data.content);
        latestContent.current = data.content;
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error('Failed to load note content:', err);
    } finally {
      setLoadingNote(false);
    }
  };

  // Save content to API
  const saveNoteContent = async (path: string, content: string) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/notes/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('unsaved');
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      setSaveStatus('unsaved');
    }
  };

  // Triggered by EditorArea when typing
  const handleEditorChange = (newContent: string) => {
    setNoteContent(newContent);
    latestContent.current = newContent;
    setSaveStatus('unsaved');

    // Debounce save (1s)
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    autoSaveTimeout.current = setTimeout(() => {
      if (selectedPath) {
        saveNoteContent(selectedPath, newContent);
      }
    }, 1000);
  };

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/notes/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Create file/folder API calls
  const handleCreateConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalInput.trim()) return;

    try {
      const isFile = modalType === 'create_file';
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isFile ? 'file' : 'directory',
          parentPath: targetPath,
          name: modalInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchTree();
        if (isFile) {
          handleSelectNote(data.relativePath);
        }
      } else {
        alert(data.error || 'Failed to create item');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalType(null);
      setModalInput('');
    }
  };

  // Rename item API call
  const handleRenameItem = async (oldPath: string, newPath: string) => {
    try {
      const res = await fetch('/api/notes/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTree();
        if (selectedPath === oldPath) {
          setSelectedPath(data.relativePath);
        }
      } else {
        alert(data.error || 'Failed to rename');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete item API call
  const handleDeleteConfirm = async () => {
    try {
      const res = await fetch('/api/notes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      if (res.ok) {
        await fetchTree();
        if (selectedPath === targetPath) {
          setSelectedPath(null);
          setNoteContent('');
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalType(null);
    }
  };

  const handleLogout = async () => {
    if (saveStatus === 'unsaved' && selectedPath) {
      await saveNoteContent(selectedPath, latestContent.current);
    }

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // WikiLink resolution
  const handleSelectWikiLink = async (noteName: string) => {
    // 1. Search in existing file tree for noteName.md
    const targetFilename = `${noteName.toLowerCase()}.md`;
    let foundPath: string | null = null;

    const findNote = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (!node.isDirectory && node.name.toLowerCase() === targetFilename) {
          foundPath = node.relativePath;
          return;
        }
        if (node.children) {
          findNote(node.children);
        }
      }
    };

    findNote(tree);

    if (foundPath) {
      handleSelectNote(foundPath);
    } else {
      // 2. If not found, create a new note in root folder
      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'file',
            parentPath: '',
            name: `${noteName}.md`,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          await fetchTree();
          handleSelectNote(data.relativePath);
        } else {
          alert('Failed to automatically create linked note: ' + data.error);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSetEmoji = async (path: string, emoji: string) => {
    try {
      const res = await fetch('/api/notes/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, emoji }),
      });
      if (res.ok) {
        await fetchTree();
      } else {
        alert('Failed to set folder icon');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getActiveFolder = (): string => {
    if (!selectedPath) return '';
    
    const findNode = (nodes: FileNode[], target: string): FileNode | null => {
      for (const node of nodes) {
        if (node.relativePath === target) return node;
        if (node.children) {
          const found = findNode(node.children, target);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(tree, selectedPath);
    if (node?.isDirectory) {
      return selectedPath;
    }
    
    const lastSlash = selectedPath.lastIndexOf('/');
    if (lastSlash === -1) return '';
    return selectedPath.substring(0, lastSlash);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)' }}>
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">McNatt Notes</div>
          
          <div className="theme-selector">
            <button 
              className={`theme-btn ${theme === 'sepia' ? 'active' : ''}`}
              onClick={() => handleThemeChange('sepia')}
              title="Sepia Mode"
            >
              <Coffee size={14} />
            </button>
            <button 
              className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => handleThemeChange('light')}
              title="Light Mode"
            >
              <Sun size={14} />
            </button>
            <button 
              className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => handleThemeChange('dark')}
              title="Dark Mode"
            >
              <Moon size={14} />
            </button>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-info">
            <span className="user-name">@{username}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={14} />
            Logout
          </button>
        </div>

        {/* Global Search */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search all notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Search Results or standard File Tree */}
        {searchQuery.trim() ? (
          <div className="search-results-panel">
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {searching ? 'Searching...' : `Found ${searchResults.length} matches`}
            </div>
            {searchResults.map(result => (
              <div 
                key={result.relativePath}
                className="search-result-item"
                onClick={() => {
                  setSearchQuery('');
                  handleSelectNote(result.relativePath);
                }}
              >
                <div className="search-result-title">{result.title}</div>
                <div className="search-result-path">{result.relativePath.replace('.md', '')}</div>
                <div className="search-result-matches">
                  {result.matches.map((match, i) => (
                    <div 
                      key={i} 
                      className="search-result-match"
                      dangerouslySetInnerHTML={{
                        __html: `Line ${match.line}: ${match.text.replace(
                          new RegExp(`(${searchQuery})`, 'gi'),
                          '<em>$1</em>'
                        )}`
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Standard actions for tree root */}
            <div className="sidebar-actions">
              <button 
                className="action-btn"
                onClick={() => {
                  setTargetPath(getActiveFolder());
                  setModalType('create_file');
                }}
              >
                <FilePlus size={14} />
                New Note
              </button>
              <button 
                className="action-btn"
                onClick={() => {
                  setTargetPath(getActiveFolder());
                  setModalType('create_folder');
                }}
              >
                <FolderPlus size={14} />
                New Folder
              </button>
            </div>

            {/* Recursive File Tree */}
            <FileTree
              tree={tree}
              selectedPath={selectedPath}
              onSelect={handleSelectNote}
              onCreateItem={(type, parentPath) => {
                setTargetPath(parentPath);
                setModalType(type === 'file' ? 'create_file' : 'create_folder');
              }}
              onRenameItem={handleRenameItem}
              onDeleteItem={(path) => {
                setTargetPath(path);
                setModalType('delete');
              }}
              onSetEmoji={handleSetEmoji}
            />
          </>
        )}
      </div>

      {/* Main Workspace */}
      <div className="workspace">
        {selectedPath ? (
          loadingNote ? (
            <div className="empty-state">
              <Loader className="animate-spin" size={24} />
              <span>Loading document...</span>
            </div>
          ) : (
            <EditorArea
              notePath={selectedPath}
              initialContent={noteContent}
              onSave={handleEditorChange}
              onSelectWikiLink={handleSelectWikiLink}
              saveStatus={saveStatus}
            />
          )
        ) : (
          <div className="empty-state">
            <div className="empty-logo">McNatt Cloud</div>
            <p>Select a note from the sidebar or create a new one to start writing.</p>
          </div>
        )}
      </div>

      {/* Dialog Modals */}
      {modalType && (
        <div className="dialog-overlay">
          {modalType === 'delete' ? (
            <div className="dialog">
              <div className="dialog-title">Delete Item</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Are you sure you want to delete &quot;{targetPath.split('/').pop()?.replace('.md', '')}&quot;? This action cannot be undone.
              </p>
              <div className="dialog-actions">
                <button 
                  className="dialog-btn cancel"
                  onClick={() => setModalType(null)}
                >
                  Cancel
                </button>
                <button 
                  className="dialog-btn confirm"
                  style={{ backgroundColor: '#e74c3c' }}
                  onClick={handleDeleteConfirm}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateConfirm} className="dialog">
              <div className="dialog-title">
                {modalType === 'create_file' ? 'Create New Note' : 'Create New Folder'}
              </div>
              <div className="form-group">
                <label className="form-label">
                  {modalType === 'create_file' ? 'Note Name' : 'Folder Name'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={modalType === 'create_file' ? 'e.g. Chapter 1' : 'e.g. Characters'}
                  value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="dialog-actions">
                <button 
                  type="button" 
                  className="dialog-btn cancel"
                  onClick={() => {
                    setModalType(null);
                    setModalInput('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="dialog-btn confirm"
                >
                  Create
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
