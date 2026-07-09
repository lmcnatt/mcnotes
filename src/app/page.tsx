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
  Loader,
  Menu
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    const init = async () => {
      await fetchTree();
      const savedPath = localStorage.getItem('notes-selected-path');
      if (savedPath) {
        handleSelectNote(savedPath);
      }
    };
    init();

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
    localStorage.setItem('notes-selected-path', path);
    setSaveStatus('saved');
    setSidebarOpen(false);

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
          localStorage.removeItem('notes-selected-path');
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
    <div className="relative flex w-screen h-screen overflow-hidden bg-app">
      {/* Mobile Top Navigation Header */}
      <div 
        className="lg:hidden flex items-center justify-between w-full h-14 px-4 border-b border-border z-30 absolute top-0 left-0"
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
      >
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg text-main hover:bg-card-hover"
          title="Open Menu"
        >
          <Menu size={20} />
        </button>
        <span className="font-semibold text-main text-sm truncate max-w-[200px]">
          {selectedPath ? selectedPath.split('/').pop()?.replace('.md', '') : 'McNatt Notes'}
        </span>
        <div className="w-8 h-8" />
      </div>

      {/* Sidebar Backdrop Overlay (Mobile only) */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-200"
        />
      )}

      {/* Sidebar */}
      <div 
        className={`
          sidebar
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-10
          max-w-[85vw]
          transition-transform duration-200 ease-in-out
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-theme bg-sidebar-bg">
          <div className="text-lg font-bold font-serif text-accent tracking-tight">McNatt Notes</div>
          
          <div className="flex gap-1">
            <button 
              className={`p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-card-hover transition ${theme === 'sepia' ? 'bg-card-bg text-accent border border-border-theme/40 shadow-sm' : ''}`}
              onClick={() => handleThemeChange('sepia')}
              title="Sepia Mode"
            >
              <Coffee size={14} />
            </button>
            <button 
              className={`p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-card-hover transition ${theme === 'light' ? 'bg-card-bg text-accent border border-border-theme/40 shadow-sm' : ''}`}
              onClick={() => handleThemeChange('light')}
              title="Light Mode"
            >
              <Sun size={14} />
            </button>
            <button 
              className={`p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-card-hover transition ${theme === 'dark' ? 'bg-card-bg text-accent border border-border-theme/40 shadow-sm' : ''}`}
              onClick={() => handleThemeChange('dark')}
              title="Dark Mode"
            >
              <Moon size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-border-theme bg-sidebar-bg/50">
          <div className="user-info">
            <span className="text-xs font-semibold text-text-muted">@{username}</span>
          </div>
          <button 
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold text-text-muted hover:text-text-main border border-border-theme/60 hover:bg-card-bg rounded-lg transition"
            onClick={handleLogout}
          >
            <LogOut size={12} />
            Logout
          </button>
        </div>

        {/* Global Search */}
        <div className="p-4 border-b border-border-theme bg-sidebar-bg/20">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-text-muted pointer-events-none" />
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2 bg-card-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg text-sm text-text-main placeholder-text-muted/65 focus:outline-none transition"
              placeholder="Search all notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Search Results or standard File Tree */}
        {searchQuery.trim() ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
              {searching ? 'Searching...' : `Found ${searchResults.length} matches`}
            </div>
            {searchResults.map(result => (
              <div 
                key={result.relativePath}
                className="p-3 bg-card-bg border border-border-theme hover:border-accent rounded-lg cursor-pointer transition"
                onClick={() => {
                  setSearchQuery('');
                  handleSelectNote(result.relativePath);
                }}
              >
                <div className="font-semibold text-xs text-text-main mb-1">{result.title}</div>
                <div className="text-[10px] text-text-muted mb-2 truncate">{result.relativePath.replace('.md', '')}</div>
                <div className="text-[10px] text-text-muted space-y-1">
                  {result.matches.map((match, i) => (
                    <div 
                      key={i} 
                      className="line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: `Line ${match.line}: ${match.text.replace(
                          new RegExp(`(${searchQuery})`, 'gi'),
                          '<mark class="bg-accent/20 text-accent font-semibold px-0.5 rounded">$1</mark>'
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
            <div className="flex gap-2 p-4 border-b border-border-theme bg-sidebar-bg/10">
              <button 
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-accent text-white hover:bg-accent-hover rounded-lg transition shadow-sm"
                onClick={() => {
                  setTargetPath(getActiveFolder());
                  setModalType('create_file');
                }}
              >
                <FilePlus size={12} />
                New Note
              </button>
              <button 
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-card-bg border border-border-theme hover:border-accent text-text-main hover:bg-card-hover rounded-lg transition"
                onClick={() => {
                  setTargetPath(getActiveFolder());
                  setModalType('create_folder');
                }}
              >
                <FolderPlus size={12} />
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
      <div className="flex-1 flex flex-col h-full overflow-hidden pt-14 lg:pt-0">
        {selectedPath ? (
          loadingNote ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-text-muted">
              <Loader className="animate-spin" size={24} />
              <span className="text-xs font-semibold">Loading document...</span>
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
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-app-bg select-none">
            <div className="text-4xl font-bold font-serif text-border-theme mb-4 tracking-widest uppercase">McNatt Notes</div>
            <p className="text-sm text-text-muted max-w-sm leading-relaxed">Select a note from the sidebar or create a new one to start writing.</p>
          </div>
        )}
      </div>

      {/* Dialog Modals */}
      {modalType && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          {modalType === 'delete' ? (
            <div className="bg-card-bg border border-border-theme w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-lg font-bold text-text-main">Delete Item</div>
              <p className="text-sm text-text-muted leading-relaxed">
                Are you sure you want to delete &quot;{targetPath.split('/').pop()?.replace('.md', '')}&quot;? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition"
                  onClick={() => setModalType(null)}
                >
                  Cancel
                </button>
                <button 
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition shadow-sm"
                  onClick={handleDeleteConfirm}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateConfirm} className="bg-card-bg border border-border-theme w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="text-lg font-bold text-text-main">
                {modalType === 'create_file' ? 'Create New Note' : 'Create New Folder'}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted">
                  {modalType === 'create_file' ? 'Note Name' : 'Folder Name'}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg text-sm text-text-main focus:outline-none transition"
                  placeholder={modalType === 'create_file' ? 'e.g. Chapter 1' : 'e.g. Characters'}
                  value={modalInput}
                  onChange={e => setModalInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-main hover:bg-card-hover rounded-lg transition"
                  onClick={() => {
                    setModalType(null);
                    setModalInput('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition shadow-sm"
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
