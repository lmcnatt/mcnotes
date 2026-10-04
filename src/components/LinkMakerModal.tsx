'use client';

import React, { useState, useEffect } from 'react';
import { Link2, FolderSearch, X } from 'lucide-react';
import FilePickerModal from './FilePickerModal';
import {
  resolveLink,
  extractHeadingsAndParagraphs,
  type MarkdownHeading,
  type MarkdownParagraph,
} from '@/lib/linkUtils';

export interface ExistingLinkData {
  text: string;
  url: string;
  isEmbed: boolean;
  replaceStart: number;
  replaceEnd: number;
}

interface LinkMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (markdown: string, replaceStart?: number, replaceEnd?: number) => void;
  currentNotePath: string;
  currentContent: string;
  selectedText: string;
  cursorOffset: number;
  existingLinkData?: ExistingLinkData | null;
  projects: { name: string; emoji: string }[];
  precheckEmbed?: boolean;
  onAppendBlockIdToCurrentNote?: (line: number, blockId: string) => void;
}

export default function LinkMakerModal({
  isOpen,
  onClose,
  onSubmit,
  currentNotePath,
  currentContent,
  selectedText,
  existingLinkData,
  projects,
  precheckEmbed = false,
  onAppendBlockIdToCurrentNote,
}: LinkMakerModalProps) {
  const [linkText, setLinkText] = useState('');
  const [linkContent, setLinkContent] = useState('');
  const [selectedSection, setSelectedSection] = useState(''); // e.g. "#heading-slug" or "#^blockid" or ""
  const [isEmbed, setIsEmbed] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Section options (headings & paragraphs)
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const [paragraphs, setParagraphs] = useState<MarkdownParagraph[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  // Target full path (e.g. "Project/Folder/Note.md" or current note)
  const [targetFullPath, setTargetFullPath] = useState(currentNotePath);

  useEffect(() => {
    if (!isOpen) return;

    if (existingLinkData) {
      setLinkText(existingLinkData.text);
      // Split url into path and anchor
      const hashIdx = existingLinkData.url.indexOf('#');
      if (hashIdx !== -1) {
        setLinkContent(existingLinkData.url.slice(0, hashIdx));
        setSelectedSection(existingLinkData.url.slice(hashIdx));
      } else {
        setLinkContent(existingLinkData.url);
        setSelectedSection('');
      }
      setIsEmbed(existingLinkData.isEmbed);
      setTargetFullPath(resolveLink(currentNotePath, existingLinkData.url).targetFullPath || currentNotePath);
    } else {
      const isUrl = /^https?:\/\//i.test(selectedText.trim());
      if (isUrl) {
        setLinkText('');
        setLinkContent(selectedText.trim());
      } else {
        setLinkText(selectedText);
        setLinkContent('');
      }
      setSelectedSection('');
      setIsEmbed(precheckEmbed);
      setTargetFullPath(currentNotePath);
    }
  }, [isOpen, selectedText, existingLinkData, precheckEmbed, currentNotePath]);

  // Load sections whenever target note changes
  useEffect(() => {
    if (!isOpen) return;

    // If empty or anchor-only, load sections of current note
    const target = linkContent ? resolveLink(currentNotePath, linkContent).targetFullPath : currentNotePath;
    if (!target || !target.endsWith('.md')) {
      setHeadings([]);
      setParagraphs([]);
      return;
    }

    if (target === currentNotePath) {
      const { headings: h, paragraphs: p } = extractHeadingsAndParagraphs(currentContent);
      setHeadings(h);
      setParagraphs(p);
      setTargetFullPath(currentNotePath);
      return;
    }

    let isMounted = true;
    const fetchSections = async () => {
      try {
        setLoadingSections(true);
        const res = await fetch(`/api/notes/links/sections?path=${encodeURIComponent(target)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHeadings(data.headings || []);
            setParagraphs(data.paragraphs || []);
            setTargetFullPath(target);
          }
        }
      } catch (err) {
        console.error('Failed to load sections:', err);
      } finally {
        if (isMounted) setLoadingSections(false);
      }
    };

    fetchSections();

    return () => {
      isMounted = false;
    };
  }, [isOpen, linkContent, currentNotePath, currentContent]);

  const handleSelectFromPicker = (item: {
    relativePath: string;
    fullPath: string;
    isThisNote: boolean;
    title: string;
  }) => {
    setShowFilePicker(false);
    if (item.isThisNote) {
      setLinkContent('');
      setTargetFullPath(currentNotePath);
      if (!linkText) setLinkText(item.title);
    } else {
      setLinkContent(item.relativePath);
      setTargetFullPath(item.fullPath);
      if (!linkText) setLinkText(item.title);
    }
    setSelectedSection('');
  };

  const handleSectionChange = async (value: string) => {
    // If user selected a paragraph without existing ID (marked with "need_id:<line>")
    if (value.startsWith('need_id:')) {
      const lineNum = parseInt(value.split(':')[1], 10);
      const randomId = Math.random().toString(36).substring(2, 8);

      // Immediately update paragraphs state so the option with #^randomId exists right away and stays selected
      setParagraphs((prev) =>
        prev.map((p) => (p.line === lineNum ? { ...p, existingId: randomId } : p))
      );
      setSelectedSection(`#^${randomId}`);

      if (targetFullPath === currentNotePath) {
        // Append in current editor
        if (onAppendBlockIdToCurrentNote) {
          onAppendBlockIdToCurrentNote(lineNum, randomId);
        }
      } else {
        // Save to target note via API
        try {
          const res = await fetch('/api/notes/links/sections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: targetFullPath,
              line: lineNum,
              id: randomId,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.id && data.id !== randomId) {
              setParagraphs((prev) =>
                prev.map((p) => (p.line === lineNum ? { ...p, existingId: data.id } : p))
              );
              setSelectedSection(`#^${data.id}`);
            }
          }
        } catch (err) {
          console.error('Failed to create block ID in target note:', err);
        }
      }
    } else {
      setSelectedSection(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let targetHref = linkContent.trim();
    const sectionAnchor = selectedSection.startsWith('need_id:') ? '' : selectedSection;

    // Combine path + section
    if (sectionAnchor) {
      targetHref = targetHref ? `${targetHref}${sectionAnchor}` : sectionAnchor;
    }

    if (!targetHref) {
      targetHref = '#';
    }

    // Default text if empty
    let finalText = linkText.trim();
    if (!finalText) {
      const resolved = resolveLink(currentNotePath, targetHref);
      const name = resolved.targetFullPath.split('/').pop()?.replace('.md', '') || 'Note';

      if (sectionAnchor.startsWith('#^')) {
        const blockId = sectionAnchor.slice(2);
        const foundP = paragraphs.find((p) => p.existingId === blockId);
        const snippet = foundP ? (foundP.text.length > 35 ? `${foundP.text.slice(0, 35)}...` : foundP.text) : '';
        finalText = snippet ? `${name} > ${snippet}` : name;
      } else if (sectionAnchor.startsWith('#')) {
        const foundH = headings.find((h) => `#${h.slug}` === sectionAnchor);
        finalText = foundH ? `${name} > ${foundH.text}` : name;
      } else if (targetHref.startsWith('http')) {
        finalText = targetHref;
      } else {
        finalText = name;
      }
    }

    const prefix = isEmbed ? '!' : '';
    const markdown = `${prefix}[${finalText}](${targetHref})`;

    onSubmit(
      markdown,
      existingLinkData?.replaceStart,
      existingLinkData?.replaceEnd
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col w-full max-w-md bg-card-bg border border-border-theme rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-theme bg-sidebar-bg/30">
            <div className="flex items-center gap-2">
              <Link2 size={18} className="text-accent" />
              <h2 className="text-sm font-bold text-text-main">
                {existingLinkData ? 'Edit Link' : isEmbed ? 'Embed Note' : 'Insert Link'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-card-hover transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Fields */}
          <div className="p-5 space-y-4">
            {/* 1. Link Text */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Link Text</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-xl text-sm text-text-main placeholder-text-muted/60 focus:outline-none transition"
                placeholder="Display text (defaults to target title)"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                autoFocus
              />
            </div>

            {/* 2. Link Content + Browse Button */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Link Target (Note, Folder, or URL)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-xl text-sm text-text-main placeholder-text-muted/60 focus:outline-none transition"
                  placeholder="e.g. Chapter 2.md or https://..."
                  value={linkContent}
                  onChange={(e) => setLinkContent(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowFilePicker(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-card-bg border border-border-theme hover:border-accent hover:bg-card-hover text-text-main rounded-xl text-xs font-semibold transition shrink-0"
                  title="Browse notes and folders"
                >
                  <FolderSearch size={15} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            {/* 3. Section (Optional Dropdown) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-muted">Section or Block (Optional)</label>
                {loadingSections && <span className="text-[10px] text-accent">Loading sections...</span>}
              </div>
              <select
                className="w-full px-3 py-2 bg-app-bg border border-border-theme hover:border-accent focus:border-accent rounded-xl text-sm text-text-main focus:outline-none transition disabled:opacity-50"
                value={selectedSection}
                onChange={(e) => handleSectionChange(e.target.value)}
                disabled={headings.length === 0 && paragraphs.length === 0}
              >
                <option value="">(None - whole note)</option>
                {headings.length > 0 && (
                  <optgroup label="Headings">
                    {headings.map((h, i) => (
                      <option key={`h-${i}`} value={`#${h.slug}`}>
                        {'—'.repeat(h.level - 1)} {h.text}
                      </option>
                    ))}
                  </optgroup>
                )}
                {paragraphs.length > 0 && (
                  <optgroup label="Paragraphs (Blocks)">
                    {paragraphs.slice(0, 30).map((p, i) => {
                      const val = p.existingId ? `#^${p.existingId}` : `need_id:${p.line}`;
                      const preview = p.text.length > 45 ? `${p.text.slice(0, 45)}...` : p.text;
                      return (
                        <option key={`p-${i}`} value={val}>
                          ¶ {preview} {p.existingId ? `(^${p.existingId})` : '(auto-id)'}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>

            {/* 4. Embed Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-text-main cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isEmbed}
                  onChange={(e) => setIsEmbed(e.target.checked)}
                  className="rounded text-accent focus:ring-accent"
                />
                <span>Embed content into note (transclusion <code>![]()</code>)</span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-theme bg-sidebar-bg/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-main rounded-xl hover:bg-card-hover transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover rounded-xl shadow-sm transition"
            >
              {existingLinkData ? 'Save Link' : 'Insert Link'}
            </button>
          </div>
        </form>
      </div>

      {/* Nested File Picker Modal */}
      {showFilePicker && (
        <FilePickerModal
          isOpen={showFilePicker}
          onClose={() => setShowFilePicker(false)}
          onSelect={handleSelectFromPicker}
          currentNotePath={currentNotePath}
          projects={projects}
        />
      )}
    </>
  );
}
