'use client';

import React, { useState, useEffect } from 'react';
import { Link2, ChevronUp, ChevronDown, FileText, Loader } from 'lucide-react';
import type { BacklinkItem } from '@/lib/linkUtils';

interface BacklinksPanelProps {
  notePath: string;
  onSelectNote: (fullPath: string, anchor?: string) => void;
}

export default function BacklinksPanel({ notePath, onSelectNote }: BacklinksPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notePath) {
      setBacklinks([]);
      return;
    }

    let isMounted = true;
    const fetchBacklinks = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/notes/links/backlinks?path=${encodeURIComponent(notePath)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setBacklinks(data.backlinks || []);
        }
      } catch (err) {
        console.error('Failed to load backlinks:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBacklinks();

    return () => {
      isMounted = false;
    };
  }, [notePath]);

  const count = backlinks.length;

  return (
    <div className="relative flex items-center">
      {/* Toggle button in footer */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition select-none ${
          count > 0 ? 'text-accent hover:bg-accent/10' : 'text-text-muted hover:text-text-main hover:bg-card-hover'
        }`}
        title="View backlinks to this note"
      >
        <Link2 size={13} className="shrink-0" />
        <span>
          {count} {count === 1 ? 'backlink' : 'backlinks'}
        </span>
        {isOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {/* Upward Sliding Panel */}
      {isOpen && (
        <>
          {/* Backdrop to close on click outside */}
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 bottom-full mb-2 w-72 sm:w-80 max-h-72 bg-card-bg border border-border-theme rounded-2xl shadow-2xl z-40 overflow-hidden flex flex-col animate-in slide-in-from-bottom-2 fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-theme bg-sidebar-bg/30">
              <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                <Link2 size={14} className="text-accent" />
                Backlinks ({count})
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[11px] text-text-muted hover:text-text-main font-semibold"
              >
                Close
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
                  <Loader className="animate-spin" size={14} />
                  <span>Loading backlinks...</span>
                </div>
              ) : backlinks.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">No backlinks to this note yet.</div>
              ) : (
                backlinks.map((b, i) => (
                  <div
                    key={`${b.sourcePath}-${i}`}
                    onClick={() => {
                      onSelectNote(b.sourcePath, b.anchor);
                      setIsOpen(false);
                    }}
                    className="p-2.5 rounded-xl border border-border-theme/40 bg-app-bg/50 hover:bg-card-hover hover:border-accent cursor-pointer transition select-none group"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-text-main mb-0.5 group-hover:text-accent">
                      <FileText size={12} className="opacity-70 shrink-0" />
                      <span className="truncate">{b.title}</span>
                    </div>
                    <div className="text-[10px] text-text-muted truncate mb-1 opacity-75">{b.sourcePath}</div>
                    {b.snippet && (
                      <div className="text-[11px] text-text-muted line-clamp-2 italic bg-sidebar-bg/20 rounded px-1.5 py-1">
                        &quot;{b.snippet}&quot;
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
