'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, MoreHorizontal } from 'lucide-react';
import type { FileNode } from '@/lib/notes';

// Helper to find node in tree by path
function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.relativePath === targetPath) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

interface BreadcrumbNavigatorProps {
  notePath: string; // e.g. "Project/Folder/Subfolder/Note.md"
  projects: { name: string; emoji: string }[];
  activeProjectTree: FileNode[];
  onSelectNote: (fullPath: string) => void;
}

export default function BreadcrumbNavigator({
  notePath,
  projects,
  activeProjectTree,
  onSelectNote,
}: BreadcrumbNavigatorProps) {
  // Active open dropdown segment index: null, 'project', number (folder segment index), 'note', or 'overflow'
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [projectTrees, setProjectTrees] = useState<Record<string, FileNode[]>>({});
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse path segments
  const segments = useMemo(() => {
    if (!notePath) return [];
    return notePath.split('/');
  }, [notePath]);

  const projectName = segments[0] || '';
  const projectEmoji = projects.find((p) => p.name === projectName)?.emoji || '📁';
  const intermediateFolders = segments.slice(1, -1);
  const noteFileName = segments[segments.length - 1] || '';
  const noteName = noteFileName.replace('.md', '');

  // Keep active project tree in cache
  useEffect(() => {
    if (projectName && activeProjectTree.length > 0) {
      setProjectTrees((prev) => ({
        ...prev,
        [projectName]: activeProjectTree,
      }));
    }
  }, [projectName, activeProjectTree]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: Event) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setActiveDropdown(null);
      }
    };

    if (activeDropdown !== null) {
      window.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [activeDropdown]);

  // Fetch tree for a project if expanding another project
  const loadProjectTree = async (name: string) => {
    if (projectTrees[name]) return;
    try {
      const res = await fetch(`/api/notes?project=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        setProjectTrees((prev) => ({
          ...prev,
          [name]: data.tree || [],
        }));
      }
    } catch (err) {
      console.error('Failed to load project tree:', err);
    }
  };

  const toggleFolder = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Get sibling items at a specific intermediate folder segment
  const getFolderSiblings = useCallback((folderIndex: number): FileNode[] => {
    const tree = projectTrees[projectName] || activeProjectTree;
    if (folderIndex === 0) {
      // Direct children of project root
      return tree;
    }
    // Parent folder relative path
    const parentPath = segments.slice(0, folderIndex + 1).join('/');
    const parentNode = findNodeByPath(tree, parentPath);
    return parentNode?.children || [];
  }, [projectTrees, projectName, activeProjectTree, segments]);

  // Get items for note segment (siblings in current note's folder)
  const getNoteSiblings = useCallback((): FileNode[] => {
    const tree = projectTrees[projectName] || activeProjectTree;
    if (intermediateFolders.length === 0) {
      // In project root
      return tree;
    }
    const currentFolderFullPath = segments.slice(0, -1).join('/');
    const folderNode = findNodeByPath(tree, currentFolderFullPath);
    return folderNode?.children || [];
  }, [projectTrees, projectName, activeProjectTree, intermediateFolders, segments]);

  // Flatten currently visible items in the active dropdown for keyboard navigation
  const visibleFlatItems = useMemo(() => {
    if (!activeDropdown) return [];

    const list: Array<{
      key: string;
      title: string;
      fullPath: string;
      isDirectory: boolean;
      isCurrent: boolean;
      emoji?: string;
      depth: number;
      projectTarget?: string;
    }> = [];

    if (activeDropdown === 'project') {
      // All projects
      for (const p of projects) {
        const isCurrent = p.name === projectName;
        const isExp = expandedFolders[`proj_${p.name}`];
        list.push({
          key: `proj_${p.name}`,
          title: p.name,
          fullPath: p.name,
          isDirectory: true,
          isCurrent,
          emoji: p.emoji || '📁',
          depth: 0,
          projectTarget: p.name,
        });

        if (isExp) {
          const pTree = projectTrees[p.name] || [];
          const traverse = (nodes: FileNode[], d: number) => {
            for (const n of nodes) {
              const isNodeCurrent = n.relativePath === notePath;
              list.push({
                key: n.relativePath,
                title: n.name.replace('.md', ''),
                fullPath: n.relativePath,
                isDirectory: n.isDirectory,
                isCurrent: isNodeCurrent,
                emoji: n.emoji,
                depth: d,
              });
              if (n.isDirectory && expandedFolders[n.relativePath] && n.children) {
                traverse(n.children, d + 1);
              }
            }
          };
          traverse(pTree, 1);
        }
      }
    } else if (activeDropdown === 'note') {
      const items = getNoteSiblings();
      const traverse = (nodes: FileNode[], d: number) => {
        for (const n of nodes) {
          const isNodeCurrent = n.relativePath === notePath;
          list.push({
            key: n.relativePath,
            title: n.name.replace('.md', ''),
            fullPath: n.relativePath,
            isDirectory: n.isDirectory,
            isCurrent: isNodeCurrent,
            emoji: n.emoji,
            depth: d,
          });
          if (n.isDirectory && expandedFolders[n.relativePath] && n.children) {
            traverse(n.children, d + 1);
          }
        }
      };
      traverse(items, 0);
    } else if (activeDropdown.startsWith('folder_')) {
      const idx = parseInt(activeDropdown.split('_')[1], 10);
      const items = getFolderSiblings(idx);
      const currentSegmentPath = segments.slice(0, idx + 2).join('/');
      const traverse = (nodes: FileNode[], d: number) => {
        for (const n of nodes) {
          const isNodeCurrent = n.relativePath === currentSegmentPath;
          list.push({
            key: n.relativePath,
            title: n.name.replace('.md', ''),
            fullPath: n.relativePath,
            isDirectory: n.isDirectory,
            isCurrent: isNodeCurrent,
            emoji: n.emoji,
            depth: d,
          });
          if (n.isDirectory && expandedFolders[n.relativePath] && n.children) {
            traverse(n.children, d + 1);
          }
        }
      };
      traverse(items, 0);
    } else if (activeDropdown === 'overflow') {
      // List the intermediate folders
      intermediateFolders.forEach((f, i) => {
        const full = segments.slice(0, i + 2).join('/');
        list.push({
          key: full,
          title: f,
          fullPath: full,
          isDirectory: true,
          isCurrent: false,
          depth: 0,
        });
      });
    }

    return list;
  }, [activeDropdown, projects, projectName, expandedFolders, projectTrees, notePath, segments, intermediateFolders, getFolderSiblings, getNoteSiblings]);

  // Reset focus on dropdown open
  useEffect(() => {
    if (activeDropdown !== null) {
      setFocusedIndex(0);
    }
  }, [activeDropdown]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((idx) => Math.min(visibleFlatItems.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((idx) => Math.max(0, idx - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const current = visibleFlatItems[focusedIndex];
      if (current && current.isDirectory) {
        if (current.projectTarget) {
          loadProjectTree(current.projectTarget);
          setExpandedFolders((prev) => ({ ...prev, [current.key]: true }));
        } else {
          setExpandedFolders((prev) => ({ ...prev, [current.key]: true }));
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const current = visibleFlatItems[focusedIndex];
      if (current && current.isDirectory && expandedFolders[current.key]) {
        setExpandedFolders((prev) => ({ ...prev, [current.key]: false }));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = visibleFlatItems[focusedIndex];
      if (current) {
        if (current.isDirectory) {
          if (current.projectTarget) {
            loadProjectTree(current.projectTarget);
            setExpandedFolders((prev) => ({ ...prev, [current.key]: !prev[current.key] }));
          } else {
            toggleFolder(current.key);
          }
        } else {
          onSelectNote(current.fullPath);
          setActiveDropdown(null);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setActiveDropdown(null);
    }
  };

  // Determine whether to collapse middle segments
  const shouldCollapseMiddle = intermediateFolders.length > 2;
  const visibleIntermediate = shouldCollapseMiddle ? [] : intermediateFolders;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="relative flex items-center gap-1 text-xs text-text-muted select-none min-w-0 max-w-full outline-none"
    >
      {/* 1. Project Segment */}
      <button
        onClick={() => {
          setActiveDropdown((cur) => (cur === 'project' ? null : 'project'));
        }}
        className={`flex items-center gap-1.5 px-2 py-1 min-h-[36px] sm:min-h-0 rounded-lg hover:bg-card-hover hover:text-text-main transition font-medium ${
          activeDropdown === 'project' ? 'bg-card-hover text-text-main font-semibold' : ''
        }`}
        title={`Project: ${projectName}`}
      >
        <span className="text-sm shrink-0">{projectEmoji}</span>
        <span className="truncate max-w-[100px] sm:max-w-[140px]">{projectName}</span>
        <ChevronDown size={11} className="opacity-60 shrink-0" />
      </button>

      <ChevronRight size={13} className="opacity-40 shrink-0" />

      {/* Middle Segments or Overflow '…' */}
      {shouldCollapseMiddle ? (
        <>
          <button
            onClick={() => {
              setActiveDropdown((cur) => (cur === 'overflow' ? null : 'overflow'));
            }}
            className={`flex items-center gap-1 px-1.5 py-1 min-h-[36px] sm:min-h-0 rounded-lg hover:bg-card-hover hover:text-text-main transition ${
              activeDropdown === 'overflow' ? 'bg-card-hover text-text-main' : ''
            }`}
            title="Show intermediate folders"
          >
            <MoreHorizontal size={14} />
          </button>
          <ChevronRight size={13} className="opacity-40 shrink-0" />
        </>
      ) : (
        visibleIntermediate.map((folder, i) => (
          <React.Fragment key={`folder-${i}`}>
            <button
              onClick={() => {
                setActiveDropdown((cur) => (cur === `folder_${i}` ? null : `folder_${i}`));
              }}
              className={`flex items-center gap-1 px-2 py-1 min-h-[36px] sm:min-h-0 rounded-lg hover:bg-card-hover hover:text-text-main transition truncate max-w-[90px] sm:max-w-[120px] ${
                activeDropdown === `folder_${i}` ? 'bg-card-hover text-text-main font-semibold' : ''
              }`}
              title={`Folder: ${folder}`}
            >
              <Folder size={12} className="opacity-70 text-accent shrink-0" />
              <span className="truncate">{folder}</span>
              <ChevronDown size={11} className="opacity-60 shrink-0" />
            </button>
            <ChevronRight size={13} className="opacity-40 shrink-0" />
          </React.Fragment>
        ))
      )}

      {/* 2. Note Segment */}
      <button
        onClick={() => {
          setActiveDropdown((cur) => (cur === 'note' ? null : 'note'));
        }}
        className={`flex items-center gap-1.5 px-2 py-1 min-h-[36px] sm:min-h-0 rounded-lg hover:bg-card-hover text-text-main transition font-bold text-sm truncate max-w-[130px] sm:max-w-[200px] ${
          activeDropdown === 'note' ? 'bg-card-hover ring-1 ring-border-theme' : ''
        }`}
        title={`Note: ${noteName}`}
      >
        <span className="truncate">{noteName}</span>
        <ChevronDown size={11} className="opacity-60 shrink-0" />
      </button>

      {/* Dropdown Menu Anchored Below Active Segment */}
      {activeDropdown !== null && (
        <div
          ref={dropdownRef}
          className="fixed sm:absolute left-2 sm:left-0 right-2 sm:right-auto top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-full mt-1.5 sm:w-80 max-h-[70vh] z-50 bg-card-bg border border-border-theme rounded-xl shadow-2xl overflow-y-auto p-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          {visibleFlatItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-muted">No items found.</div>
          ) : (
            visibleFlatItems.map((item, idx) => {
              const isFocused = idx === focusedIndex;
              const isExpanded = expandedFolders[item.key] || false;

              return (
                <div
                  key={item.key}
                  onClick={() => {
                    setFocusedIndex(idx);
                    if (item.isDirectory) {
                      if (item.projectTarget) {
                        loadProjectTree(item.projectTarget);
                        setExpandedFolders((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                      } else {
                        toggleFolder(item.key);
                      }
                    } else {
                      onSelectNote(item.fullPath);
                      setActiveDropdown(null);
                    }
                  }}
                  style={{ paddingLeft: `${item.depth * 14 + 10}px` }}
                  className={`flex items-center gap-2 py-2.5 sm:py-1.5 px-2.5 rounded-lg cursor-pointer text-xs select-none transition min-h-[40px] sm:min-h-0 ${
                    item.isCurrent
                      ? 'bg-accent/15 text-accent font-semibold'
                      : isFocused
                      ? 'bg-card-hover text-text-main'
                      : 'hover:bg-card-hover text-text-muted hover:text-text-main'
                  }`}
                >
                  {item.isDirectory ? (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.projectTarget) {
                          loadProjectTree(item.projectTarget);
                          setExpandedFolders((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                        } else {
                          toggleFolder(item.key, e);
                        }
                      }}
                      className="p-1 -ml-1 rounded hover:bg-card-bg transition"
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
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
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
