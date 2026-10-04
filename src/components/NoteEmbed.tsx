'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink, AlertCircle, Loader } from 'lucide-react';
import { resolveLink, githubSlug } from '@/lib/linkUtils';

interface NoteEmbedProps {
  src: string;
  currentNotePath: string;
  onNavigate: (path: string, anchor?: string) => void;
  depth?: number;
  seenChain?: string[];
}

const MAX_EMBED_DEPTH = 3;

/**
 * Extracts the requested section from markdown content:
 * - Whole note if no anchor
 * - Heading section: from that heading until the next heading of same or higher level
 * - Block: paragraph ending with ^blockid
 */
function extractEmbedContent(content: string, anchor?: string): { title: string; markdown: string } {
  if (!anchor) {
    const firstH1 = content.split('\n').find((l) => l.startsWith('# '));
    const title = firstH1 ? firstH1.substring(2).trim() : 'Note';
    return { title, markdown: content };
  }

  const lines = content.split('\n');

  // Case 1: Block anchor (^id)
  if (anchor.startsWith('^')) {
    const blockId = anchor.substring(1);
    const regex = new RegExp(`\\s+\\^${blockId}$`);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        const cleanLine = lines[i].replace(regex, '');
        return { title: `Block ^${blockId}`, markdown: cleanLine };
      }
    }
    return { title: `Block ^${blockId}`, markdown: `*(Block ^${blockId} not found)*` };
  }

  // Case 2: Heading anchor (#slug)
  const targetSlug = anchor.toLowerCase();
  let headingLevel = 0;
  let startIndex = -1;
  let headingTitle = anchor;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const slug = githubSlug(m[2]);
      if (slug === targetSlug) {
        headingLevel = m[1].length;
        startIndex = i;
        headingTitle = m[2].trim();
        break;
      }
    }
  }

  if (startIndex === -1) {
    return { title: `#${anchor}`, markdown: `*(Heading #${anchor} not found)*` };
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && m[1].length <= headingLevel) {
      endIndex = i;
      break;
    }
  }

  const sectionMarkdown = lines.slice(startIndex, endIndex).join('\n');
  return { title: headingTitle, markdown: sectionMarkdown };
}

export default function NoteEmbed({
  src,
  currentNotePath,
  onNavigate,
  depth = 1,
  seenChain = [],
}: NoteEmbedProps) {
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Embedded Note');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const resolved = resolveLink(currentNotePath, src);

  useEffect(() => {
    if (!resolved.isValid || resolved.isExternal) {
      setError('Invalid embed target');
      setLoading(false);
      return;
    }

    if (depth > MAX_EMBED_DEPTH) {
      setError('Maximum embed depth reached');
      setLoading(false);
      return;
    }

    const targetKey = `${resolved.targetFullPath}#${resolved.anchor || ''}`;
    if (seenChain.includes(targetKey)) {
      setError('Cyclic embed detected');
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchContent = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/notes/content?path=${encodeURIComponent(resolved.targetFullPath)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError(`Note not found: ${resolved.targetFullPath}`);
          } else {
            setError('Failed to load embedded note');
          }
          return;
        }
        const data = await res.json();
        if (isMounted) {
          const { title: sectionTitle, markdown } = extractEmbedContent(data.content || '', resolved.anchor);
          setTitle(sectionTitle);
          setContent(markdown);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error loading embed');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchContent();

    return () => {
      isMounted = false;
    };
  }, [resolved.targetFullPath, resolved.anchor, resolved.isExternal, resolved.isValid, depth, currentNotePath, seenChain]);

  const targetKey = `${resolved.targetFullPath}#${resolved.anchor || ''}`;
  const nextChain = [...seenChain, targetKey];

  const handleOpenSource = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate(resolved.targetFullPath, resolved.anchor);
  };

  if (error) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
        <AlertCircle size={15} className="shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-border-theme/70 bg-card-bg/60 shadow-sm overflow-hidden text-text-main transition hover:border-accent/40">
      {/* Header with Title and Click-Through */}
      <div className="flex items-center justify-between border-b border-border-theme/40 bg-sidebar-bg/40 px-3 py-1.5 text-xs text-text-muted select-none">
        <div className="flex items-center gap-1.5 truncate font-medium">
          <span className="opacity-75">Embed:</span>
          <span className="font-semibold text-text-main truncate">{title}</span>
        </div>
        <button
          onClick={handleOpenSource}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/10 transition"
          title="Open source note"
        >
          <span>Open</span>
          <ExternalLink size={11} />
        </button>
      </div>

      {/* Content Area */}
      <div className="p-3.5 text-sm markdown-body">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
            <Loader className="animate-spin" size={14} />
            <span>Loading embed...</span>
          </div>
        ) : content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Nested embed support with depth increment
              img: (props: any) => {
                const { src, alt } = props;
                if (src && (src.endsWith('.md') || src.includes('.md#') || src.includes('.md?'))) {
                  return (
                    <NoteEmbed
                      src={src}
                      currentNotePath={resolved.targetFullPath}
                      onNavigate={onNavigate}
                      depth={depth + 1}
                      seenChain={nextChain}
                    />
                  );
                }
                {/* eslint-disable-next-line @next/next/no-img-element */}
                return <img {...props} alt={alt || ''} />;
              },
            }}
          >
            {content}
          </ReactMarkdown>
        ) : null}
      </div>
    </div>
  );
}
