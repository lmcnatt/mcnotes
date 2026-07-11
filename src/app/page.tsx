'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
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
  Menu,
  ChevronDown,
  Trash2,
  FileEdit
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
  const [activeProject, setActiveProject] = useState<string>('');
  const [projects, setProjects] = useState<{ name: string; emoji: string }[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectInput, setProjectInput] = useState('');
  const [projectEmojiInput, setProjectEmojiInput] = useState('');
  const [editingProject, setEditingProject] = useState<{ name: string; emoji: string } | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editEmojiInput, setEditEmojiInput] = useState('');

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

  // Fetch projects list — returns the list so callers can use it synchronously
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/notes/projects');
      if (res.ok) {
        const data = await res.json();
        const list = data.projects || [];
        setProjects(list);
        return list;
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
    return [];
  };

  // Fetch file tree and user info on mount
  const fetchTree = async (project = activeProject) => {
    try {
      const res = await fetch(`/api/notes?project=${encodeURIComponent(project)}`);
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
      const projectList = await fetchProjects();
      const savedProj = localStorage.getItem('notes-active-project') || '';
      // Only restore saved project if it still exists
      const validProj = projectList.some((p: { name: string }) => p.name === savedProj) ? savedProj : (projectList[0]?.name || '');
      setActiveProject(validProj);

      if (validProj) {
        await fetchTree(validProj);
        const savedPath = localStorage.getItem('notes-selected-path');
        if (savedPath) {
          handleSelectNote(savedPath);
        }
      } else {
        setLoading(false);
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

  const handleSwitchProject = async (project: string) => {
    if (saveStatus === 'unsaved' && selectedPath) {
      await saveNoteContent(selectedPath, latestContent.current);
    }
    setActiveProject(project);
    localStorage.setItem('notes-active-project', project);
    setSelectedPath(null);
    localStorage.removeItem('notes-selected-path');
    setNoteContent('');
    await fetchTree(project);
    setShowProjectDropdown(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectInput.trim()) return;
    try {
      const res = await fetch('/api/notes/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        // Save emoji if provided
        if (projectEmojiInput.trim()) {
          await fetch('/api/notes/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName: data.name, emoji: projectEmojiInput.trim() }),
          });
        }
        await fetchProjects();
        setProjectInput('');
        setProjectEmojiInput('');
        await handleSwitchProject(data.name);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create project');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!editNameInput.trim()) return;
    try {
      const res = await fetch('/api/notes/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          oldName: editingProject.name, 
          newName: editNameInput.trim(),
          emoji: editEmojiInput
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchProjects();
        if (activeProject === editingProject.name) {
          setActiveProject(data.name);
          localStorage.setItem('notes-active-project', data.name);
          await fetchTree(data.name);
        }
        setEditingProject(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to edit project');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async (project: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${project}" and all its notes? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch('/api/notes/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: project }),
      });
      if (res.ok) {
        const remaining = await fetchProjects();
        if (activeProject === project) {
          const next = remaining[0]?.name || '';
          setActiveProject(next);
          if (next) {
            localStorage.setItem('notes-active-project', next);
            await fetchTree(next);
          } else {
            localStorage.removeItem('notes-active-project');
            setTree([]);
            setSelectedPath(null);
            setNoteContent('');
          }
        }
      } else {
        alert('Failed to delete project');
      }
    } catch (err) {
      console.error(err);
    }
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
      <div className="flex h-screen items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)]">
        <Loader className="animate-spin" size={32} />
      </div>
    );
  }

  // No projects yet — show a blocking create-first-project prompt
  if (projects.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-app)] px-4">
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow)] text-center">
          <div>
            <div className="mb-3 flex items-center justify-center gap-3">
              <Image
                src="/branding/logos/mcnotes-app-badge.png"
                alt="McNotes logo"
                width={44}
                height={44}
                className="h-11 w-11 rounded-xl object-cover ring-1 ring-[var(--border)]"
                priority
              />
              <span className="text-4xl leading-none text-[var(--accent)] [font-family:var(--font-logo)]">McNotes</span>
            </div>
            <h1 className="text-lg font-semibold text-[var(--text-main)]">Create your first project</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Projects keep your notes organised. Create one to get started.</p>
          </div>
          <form
            onSubmit={handleCreateProject}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)]"
              placeholder="e.g. My Novel"
              value={projectInput}
              onChange={e => setProjectInput(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Create Project
            </button>
          </form>
          <button
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-screen h-screen overflow-hidden bg-app-bg">
      {/* Mobile Top Navigation Header */}
      <div className="lg:hidden flex items-center justify-between w-full h-14 px-4 border-b border-border-theme bg-sidebar-bg z-30 absolute top-0 left-0">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg text-text-main hover:bg-card-hover"
          title="Open Menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {!selectedPath && (
            <Image
              src="/branding/logos/mcnotes-app-badge.png"
              alt="McNotes"
              width={24}
              height={24}
              className="h-6 w-6 rounded-md object-cover"
            />
          )}
          <span className={`text-sm truncate max-w-[200px] ${selectedPath ? 'font-semibold text-text-main' : 'text-accent [font-family:var(--font-logo)] text-2xl leading-none pt-1'}`}>
            {selectedPath ? selectedPath.split('/').pop()?.replace('.md', '') : 'McNotes'}
          </span>
        </div>
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
          w-80 min-w-[320px] max-w-[85vw] h-full
          bg-sidebar-bg border-r border-border-theme
          flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-10
          transition-transform duration-200 ease-in-out
        `}
      >
        <div className="flex flex-col p-4 border-b border-border-theme bg-sidebar-bg gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5 min-w-0">
              <Image
                src="/branding/logos/mcnotes-app-badge.png"
                alt="McNotes badge"
                width={52}
                height={52}
                className="h-[3.2rem] w-[3.2rem] rounded-2xl object-cover border border-border-theme/70 shadow-sm"
              />
              <span className="text-[2.28rem] leading-none tracking-[-0.05em] font-semibold text-[#6f4728] [font-family:var(--font-logo)]">Notes</span>
            </div>
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

          {/* Project Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowProjectDropdown(v => !v); setEditingProject(null); }}
              className="flex items-center justify-between w-full px-3 py-2 bg-card-bg border border-border-theme/60 hover:border-accent hover:bg-card-hover rounded-lg text-xs font-bold text-text-main transition shadow-sm"
            >
              <span className="truncate flex items-center gap-2">
                <span className="text-sm">
                  {projects.find(p => p.name === activeProject)?.emoji || '📁'}
                </span>
                {activeProject || 'Select project'}
              </span>
              <ChevronDown size={14} className={`text-text-muted transition-transform duration-150 ${showProjectDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showProjectDropdown && (
              <>
                {/* Click-outside backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => { setShowProjectDropdown(false); setEditingProject(null); }}
                />
                {/* Dropdown panel */}
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card-bg border border-border-theme rounded-xl shadow-xl flex flex-col max-h-[70dvh] overflow-hidden">
                  {editingProject ? (
                    /* ── Edit project form ── */
                    <form onSubmit={handleEditProjectSubmit} className="p-3 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          type="button"
                          className="text-xs text-text-muted hover:text-text-main transition"
                          onClick={() => setEditingProject(null)}
                        >
                          ← Back
                        </button>
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Edit Project</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="w-16 px-2 py-1.5 text-lg text-center bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg focus:outline-none transition"
                          placeholder="📁"
                          value={editEmojiInput}
                          onChange={e => setEditEmojiInput(e.target.value)}
                          title="Paste any emoji here"
                        />
                        <input
                          type="text"
                          className="flex-1 px-3 py-1.5 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg text-sm text-text-main focus:outline-none transition"
                          placeholder="Project name"
                          value={editNameInput}
                          onChange={e => setEditNameInput(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text-main transition"
                          onClick={() => setEditingProject(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* ── Project list + create form ── */
                    <>
                      <div className="flex-1 overflow-y-auto py-1 min-h-0">
                        {projects.map(proj => (
                          <div
                            key={proj.name}
                            onClick={() => handleSwitchProject(proj.name)}
                            className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition select-none ${
                              proj.name === activeProject
                                ? 'bg-accent/10 text-accent font-semibold'
                                : 'hover:bg-card-hover text-text-main'
                            }`}
                          >
                            <span className="truncate text-sm flex items-center gap-2">
                              <span className="text-base">{proj.emoji || '📁'}</span>
                              {proj.name}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                className="p-1 rounded text-text-muted hover:text-accent hover:bg-card-bg transition"
                                title="Edit"
                                onClick={() => { setEditingProject(proj); setEditNameInput(proj.name); setEditEmojiInput(proj.emoji || ''); }}
                              >
                                <FileEdit size={12} />
                              </button>
                              <button
                                className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-red-500/10 transition"
                                title="Delete"
                                onClick={(e) => handleDeleteProject(proj.name, e)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border-theme/40 p-2 shrink-0">
                        <form onSubmit={handleCreateProject} className="flex gap-1.5">
                          <input
                            type="text"
                            className="w-10 px-1 py-1.5 text-lg text-center bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg focus:outline-none transition"
                            placeholder="📁"
                            value={projectEmojiInput}
                            onChange={e => setProjectEmojiInput(e.target.value)}
                            title="Emoji (optional)"
                          />
                          <input
                            type="text"
                            className="flex-1 px-2 py-1.5 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-lg text-sm text-text-main focus:outline-none transition"
                            placeholder="New project name"
                            value={projectInput}
                            onChange={e => setProjectInput(e.target.value)}
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition shrink-0"
                          >
                            Add
                          </button>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
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
                  setTargetPath(getActiveFolder() || activeProject);
                  setModalType('create_file');
                }}
              >
                <FilePlus size={12} />
                New Note
              </button>
              <button 
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-card-bg border border-border-theme hover:border-accent text-text-main hover:bg-card-hover rounded-lg transition"
                onClick={() => {
                  setTargetPath(getActiveFolder() || activeProject);
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
        
        {/* User profile / Logout at the bottom */}
        <div className="mt-auto border-t border-border-theme bg-sidebar-bg/50 px-4 py-3 flex items-center justify-between z-10 select-none">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
              {username ? username[0].toUpperCase() : 'U'}
            </div>
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
          <div className="relative flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-app-bg select-none overflow-hidden">
            <div className="pointer-events-none absolute -top-20 -left-16 h-60 w-60 rounded-full bg-accent/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-16 h-60 w-60 rounded-full bg-accent/15 blur-3xl" />
            <Image
              src="/branding/logos/mcnotes-wordmark-transparent.svg"
              alt="McNotes"
              width={420}
              height={120}
              className="mb-2 w-full max-w-[18rem] sm:max-w-[22rem] h-auto"
              priority
            />
            <div className="text-4xl sm:text-5xl font-semibold text-[#6f4728] [font-family:var(--font-logo)] leading-none mb-4">McNotes</div>
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
