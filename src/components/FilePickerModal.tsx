'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Folder, FileText, ChevronRight, ChevronDown, X, BookOpen } from 'lucide-react';
import { computeRelativePath } from '@/lib/linkUtils';

export interface FilePickerItem {
  path: string; // e.g. "Project/Folder/Note.md" or "Project/Folder/"
  name: string;
  title: string;
  isDirectory: boolean;
  project: string;
}

interface FilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: { relativePath: string; fullPath: string; isThisNote: boolean; title: string }) => void;
  currentNotePath: string;
  projects: { name: string; emoji: string }[];
}

export default function FilePickerModal({
  isOpen,
  onClose,
  onSelect,
  currentNotePath,
  projects,
}: FilePickerModalProps) {
  const [items, setItems] = useState<FilePickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Fetch all notes and folders
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchAll = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/notes/links/all');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setItems(data.items || []);
        }
      } catch (err) {
        console.error('Failed to load items for file picker:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAll();

    // Pre-expand ancestor folders of current note
    const ancestors: Record<string, boolean> = {};
    const parts = currentNotePath.split('/');
    let currentAcc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentAcc = currentAcc ? `${currentAcc}/${parts[i]}` : parts[i];
      ancestors[`${currentAcc}/`] = true;
      ancestors[currentAcc] = true;
    }
    setExpandedFolders(ancestors);
    setFilterQuery('');
    setSelectedIndex(0);

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentNotePath]);

  // Build tree structure grouped by project
  const projectMap = useMemo(() => {
    const map = new Map<string, { emoji: string; items: FilePickerItem[] }>();
    for (const p of projects) {
      map.set(p.name, { emoji: p.emoji || '📁', items: [] });
    }

    for (const item of items) {
      if (!map.has(item.project)) {
        map.set(item.project, { emoji: '📁', items: [] });
      }
      map.get(item.project)!.items.push(item);
    }
    return map;
  }, [items, projects]);

  // Filtered flat list for keyboard navigation and display
  const displayItems = useMemo(() => {
    const result: Array<{
      key: string;
      title: string;
      subtitle: string;
      fullPath: string;
      isDirectory: boolean;
      isThisNote: boolean;
      emoji?: string;
    }> = [];

    // "This note" option at top
    result.push({
      key: '__this_note__',
      title: 'This note',
      subtitle: 'Link to a heading or paragraph in the current note',
      fullPath: currentNotePath,
      isDirectory: false,
      isThisNote: true,
      emoji: '📄',
    });

    const q = filterQuery.trim().toLowerCase();

    if (q) {
      // Type-to-filter / fuzzy search across all projects
      for (const item of items) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q)
        ) {
          result.push({
            key: item.path,
            title: item.isDirectory ? item.name : item.title,
            subtitle: item.path,
            fullPath: item.path,
            isDirectory: item.isDirectory,
            isThisNote: item.path === currentNotePath,
          });
        }
      }
    } else {
      // Tree view: flatten visible items based on expandedFolders
      Array.from(projectMap.entries()).forEach(([projName, projData]) => {
        // Project root
        const projKey = `${projName}/`;
        const isProjExpanded = expandedFolders[projKey] ?? false;

        result.push({
          key: projKey,
          title: projName,
          subtitle: 'Project',
          fullPath: projKey,
          isDirectory: true,
          isThisNote: false,
          emoji: projData.emoji,
        });

        if (isProjExpanded) {
          // Sort items in this project: folders first, then alphabetical
          const sorted = [...projData.items].sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.title.localeCompare(b.title);
          });

          for (const item of sorted) {
            // Check if parent folders are expanded
            const relWithinProject = item.path.startsWith(`${projName}/`)
              ? item.path.slice(projName.length + 1)
              : item.path;
            const segments = relWithinProject.split('/').filter(Boolean);

            let visible = true;
            let checkPath = projName;
            for (let i = 0; i < segments.length - 1; i++) {
              checkPath = `${checkPath}/${segments[i]}`;
              if (!expandedFolders[`${checkPath}/`] && !expandedFolders[checkPath]) {
                visible = false;
                break;
              }
            }

            if (visible) {
              const depth = segments.length;
              const indent = '  '.repeat(depth);
              result.push({
                key: item.path,
                title: `${indent}${item.isDirectory ? item.name : item.title}`,
                subtitle: item.path,
                fullPath: item.path,
                isDirectory: item.isDirectory,
                isThisNote: item.path === currentNotePath,
              });
            }
          }
        }
      });
    }

    return result;
  }, [items, projectMap, filterQuery, expandedFolders, currentNotePath]);

  // Clamp selectedIndex when list changes
  useEffect(() => {
    if (selectedIndex >= displayItems.length) {
      setSelectedIndex(Math.max(0, displayItems.length - 1));
    }
  }, [displayItems.length, selectedIndex]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const handleSelectItem = (item: (typeof displayItems)[0]) => {
    if (item.isThisNote) {
      onSelect({
        relativePath: '',
        fullPath: currentNotePath,
        isThisNote: true,
        title: 'This note',
      });
      return;
    }

    const rel = computeRelativePath(currentNotePath, item.fullPath);
    onSelect({
      relativePath: rel,
      fullPath: item.fullPath,
      isThisNote: false,
      title: item.title.trim(),
    });
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => Math.min(displayItems.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) => Math.max(0, idx - 1));
    } else if (e.key === 'ArrowRight') {
      const current = displayItems[selectedIndex];
      if (current && current.isDirectory) {
        e.preventDefault();
        setExpandedFolders((prev) => ({ ...prev, [current.key]: true, [current.fullPath]: true }));
      }
    } else if (e.key === 'ArrowLeft') {
      const current = displayItems[selectedIndex];
      if (current && current.isDirectory) {
        e.preventDefault();
        setExpandedFolders((prev) => ({ ...prev, [current.key]: false, [current.fullPath]: false }));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = displayItems[selectedIndex];
      if (current) {
        if (current.isDirectory && !filterQuery) {
          toggleFolder(current.key);
        } else {
          handleSelectItem(current);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-lg max-h-[85vh] bg-card-bg border border-border-theme rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-theme bg-sidebar-bg/30">
          <div className="flex items-center gap-2">
            <BookOpen size={17} className="text-accent" />
            <h2 className="text-sm font-bold text-text-main">Choose Note or Folder</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-card-hover transition"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-border-theme bg-sidebar-bg/10">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full pl-9 pr-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-xl text-sm text-text-main placeholder-text-muted/60 focus:outline-none transition"
              placeholder="Search notes across all projects..."
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* Tree / Item List */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[260px] max-h-[50vh]">
          {loading ? (
            <div className="py-12 text-center text-xs text-text-muted">Loading projects...</div>
          ) : displayItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted">No notes found matching query.</div>
          ) : (
            displayItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isExpanded = expandedFolders[item.key] || false;

              return (
                <div
                  key={item.key}
                  onClick={() => {
                    setSelectedIndex(idx);
                    if (item.isDirectory && !filterQuery) {
                      toggleFolder(item.key);
                    } else {
                      handleSelectItem(item);
                    }
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer select-none text-xs transition ${
                    isSelected
                      ? 'bg-accent/15 text-accent font-semibold border border-accent/30'
                      : 'hover:bg-card-hover text-text-main'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    {item.isDirectory ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFolder(item.key);
                        }}
                        className="p-0.5 rounded hover:bg-card-bg transition"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    ) : (
                      <span className="w-3.5" />
                    )}

                    {item.emoji ? (
                      <span className="text-sm shrink-0">{item.emoji}</span>
                    ) : item.isDirectory ? (
                      <Folder size={14} className="text-accent shrink-0" />
                    ) : (
                      <FileText size={14} className="opacity-70 shrink-0" />
                    )}

                    <span className="truncate">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-[10px] text-text-muted">
                    <span className="truncate max-w-[140px] opacity-75">{item.subtitle}</span>
                    {item.isDirectory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectItem(item);
                        }}
                        className="px-2 py-0.5 rounded bg-sidebar-bg hover:bg-accent hover:text-white transition"
                        title="Link to this folder"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-theme bg-sidebar-bg/20 text-[11px] text-text-muted">
          <span>Navigate with <b>↑</b> <b>↓</b> <b>Enter</b></span>
          <button
            onClick={onClose}
            className="px-3 py-1 font-semibold rounded-lg hover:bg-card-hover transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
