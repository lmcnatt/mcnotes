'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Server,
  Loader2,
  Code,
  Sparkles,
  Terminal,
} from 'lucide-react';

interface ApiToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never used';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function McpTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenName, setTokenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<{
    id: string;
    name: string;
    rawToken: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [origin, setOrigin] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showConfigCode, setShowConfigCode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/tokens');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load tokens');
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.tokens || [];
      setTokens(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) {
      setError('Please provide a token name');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tokenName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create token');
      }

      setNewlyCreatedToken({
        id: data.id,
        name: data.name || tokenName.trim(),
        rawToken: data.rawToken,
      });
      setTokenName('');
      await loadTokens();
    } catch (err: any) {
      setError(err.message || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeToken = async (id: string) => {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke token');
      }
      if (newlyCreatedToken?.id === id) {
        setNewlyCreatedToken(null);
      }
      await loadTokens();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke token');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text: string, type: 'token' | 'config' | 'url') => {
    navigator.clipboard.writeText(text);
    if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  const mcpUrl = `${origin || 'https://your-domain.com'}/api/mcp`;
  const tokenForConfig = newlyCreatedToken?.rawToken || '<YOUR_TOKEN>';
  const configJson = JSON.stringify(
    {
      mcpServers: {
        mcnotes: {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${tokenForConfig}`,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-[var(--accent)]" />
            <h2 className="font-semibold text-lg text-[var(--text-main)]">Model Context Protocol (MCP)</h2>
          </div>
          <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
            Streamable HTTP & SSE
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Connect AI assistants to search, read, and edit your notes.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Two Connection Methods */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Method 1: OAuth (Gemini) */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 font-medium text-sm text-[var(--text-main)]">
                  <Sparkles size={15} className="text-[var(--accent)]" />
                  Gemini Connectors
                </div>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  OAuth 2.1
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Auto-negotiated connection. No manual tokens required.
              </p>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 mb-3">
                <div className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)] mb-1">
                  MCP Server URL
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-[var(--text-main)] truncate select-all">{mcpUrl}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(mcpUrl, 'url')}
                    className="shrink-0 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] transition"
                    title="Copy URL"
                  >
                    {copiedUrl ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
                <li>In Gemini, go to <strong className="text-[var(--text-main)] font-medium">Settings &gt; Connected Apps</strong>.</li>
                <li>Select <strong className="text-[var(--text-main)] font-medium">Add a custom app</strong> and paste the URL.</li>
                <li>Sign in and click <strong className="text-[var(--text-main)] font-medium">Allow</strong>.</li>
              </ol>
            </div>
          </div>

          {/* Method 2: Manual Config (Cursor, Claude) */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 font-medium text-sm text-[var(--text-main)]">
                  <Terminal size={15} className="text-[var(--accent)]" />
                  Cursor & Claude Desktop
                </div>
                <span className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                  Bearer Token
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Static client config using a Personal Access Token (PAT).
              </p>

              <ol className="text-xs text-[var(--text-muted)] space-y-1.5 list-decimal list-inside mb-4">
                <li>Generate a token in the section below.</li>
                <li>Add to <strong className="text-[var(--text-main)] font-medium">.cursor/mcp.json</strong> or <strong className="text-[var(--text-main)] font-medium">claude_desktop_config.json</strong>.</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(configJson, 'config')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2 px-3 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition"
              >
                {copiedConfig ? <Check size={14} /> : <Copy size={14} />}
                {copiedConfig ? 'Copied Config' : 'Copy Client JSON'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfigCode(!showConfigCode)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition"
                title="View JSON"
              >
                <Code size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Config Preview */}
        {showConfigCode && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[#1e1e2e] p-4 text-xs font-mono text-emerald-400 overflow-x-auto">
            <pre>{configJson}</pre>
          </div>
        )}
      </div>

      {/* Tokens Management */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <h3 className="font-semibold text-base text-[var(--text-main)] mb-1">Personal Access Tokens</h3>
        <p className="text-sm text-[var(--text-muted)]">
          Generate scoped access tokens for external MCP clients or scripts.
        </p>

        {/* Newly Created Token Alert */}
        {newlyCreatedToken && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[var(--text-main)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={18} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-600 dark:text-amber-400 text-sm">
                  Token Created: &ldquo;{newlyCreatedToken.name}&rdquo;
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Copy this token now. It will not be shown again.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[240px] rounded-lg border border-amber-500/30 bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-main)] break-all select-all">
                    {newlyCreatedToken.rawToken}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(newlyCreatedToken.rawToken, 'token')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]"
                  >
                    {copiedToken ? <Check size={14} /> : <Copy size={14} />}
                    {copiedToken ? 'Copied' : 'Copy Token'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewlyCreatedToken(null)}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Token Form */}
        <form onSubmit={handleCreateToken} className="mt-4 flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full flex-1 flex flex-col gap-1.5">
            <label htmlFor="tokenNameInput" className="text-xs font-medium text-[var(--text-muted)]">
              Token Name
            </label>
            <input
              id="tokenNameInput"
              type="text"
              placeholder="e.g. Cursor, Claude Desktop"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)]"
              disabled={creating}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !tokenName.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Generate Token
          </button>
        </form>

        {/* Tokens List */}
        <div className="mt-6">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Active Tokens
          </h4>

          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading tokens…
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-muted)]">
              No active tokens. Generate one above or connect via OAuth.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Created</th>
                    <th className="py-2 pr-3 font-semibold">Last Used</th>
                    <th className="py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-b border-[var(--border)]/50 align-middle">
                      <td className="py-2.5 pr-3 font-medium text-[var(--text-main)]">
                        <div className="flex items-center gap-2">
                          <Key size={14} className="text-[var(--accent)] shrink-0" />
                          <span>{token.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(token.created_at)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(token.last_used_at)}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRevokeToken(token.id)}
                          disabled={revokingId === token.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                          {revokingId === token.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
