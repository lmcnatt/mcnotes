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
  return isNaN(d.getTime()) ? value : d.toLocaleString();
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
  const [origin, setOrigin] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

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
        throw new Error(data.error || 'Failed to load access tokens');
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
      setError('Please provide a name for the token');
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

  const copyToClipboard = (text: string, type: 'token' | 'config') => {
    navigator.clipboard.writeText(text);
    if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  const mcpUrl = `${origin || 'https://your-domain.com'}/api/mcp`;
  const tokenForConfig = newlyCreatedToken?.rawToken || '<YOUR_TOKEN_HERE>';
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
      {/* Section Header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-[var(--accent)]" />
            <h2 className="font-semibold text-lg text-[var(--text-main)]">
              Model Context Protocol (MCP) & Integrations
            </h2>
          </div>
          <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
            Remote SSE
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Connect your favorite AI assistants (Cursor, Claude Desktop, Gemini) directly to your
          personal notes over a secure server-sent events (SSE) endpoint.
        </p>

        {/* Global Error Banner */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Newly Created Token Alert Banner */}
        {newlyCreatedToken && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[var(--text-main)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={18} />
              <div className="flex-1">
                <div className="font-semibold text-amber-600 dark:text-amber-400 text-sm">
                  Personal Access Token Generated: &ldquo;{newlyCreatedToken.name}&rdquo;
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Make sure to copy your personal access token now. You will not be able to view it
                  again!
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[260px] rounded-lg border border-amber-500/30 bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-main)] break-all select-all">
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
        <form onSubmit={handleCreateToken} className="mt-5 flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full flex-1 flex flex-col gap-1.5">
            <label htmlFor="tokenNameInput" className="text-xs font-medium text-[var(--text-muted)]">
              Token Name / Description
            </label>
            <input
              id="tokenNameInput"
              type="text"
              placeholder="e.g. Cursor IDE, Claude Desktop, Gemini"
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
            {creating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Generate Token
          </button>
        </form>

        {/* Tokens List */}
        <div className="mt-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Active Personal Access Tokens
          </h3>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading tokens…
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
              No personal access tokens generated yet. Create one above to connect external MCP clients.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2.5 pr-3 font-semibold">Name</th>
                    <th className="py-2.5 pr-3 font-semibold">Created</th>
                    <th className="py-2.5 pr-3 font-semibold">Last Used</th>
                    <th className="py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-b border-[var(--border)]/50 align-middle">
                      <td className="py-3 pr-3 font-medium text-[var(--text-main)]">
                        <div className="flex items-center gap-2">
                          <Key size={14} className="text-[var(--accent)]" />
                          <span>{token.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(token.created_at)}
                      </td>
                      <td className="py-3 pr-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(token.last_used_at)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRevokeToken(token.id)}
                          disabled={revokingId === token.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          <Trash2 size={13} />
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

      {/* Dynamic Client Configuration Card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Code size={18} className="text-[var(--accent)]" />
            <h3 className="font-semibold text-base text-[var(--text-main)]">
              Client Configuration
            </h3>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(configJson, 'config')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition"
          >
            {copiedConfig ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copiedConfig ? 'Copied' : 'Copy Config'}
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Paste this configuration into your MCP client configuration file (e.g., Cursor Settings &gt; MCP, or Claude Desktop&apos;s <code className="rounded bg-[var(--bg-app)] px-1 py-0.5">claude_desktop_config.json</code>).
        </p>

        <div className="relative rounded-xl border border-[var(--border)] bg-[#1e1e2e] p-4 text-xs font-mono text-emerald-400 overflow-x-auto shadow-inner">
          <pre>{configJson}</pre>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--text-muted)]">
          <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--bg-app)] p-3">
            <div className="font-semibold text-[var(--text-main)] mb-1">Cursor IDE</div>
            <p>Add under Settings &gt; Features &gt; MCP Servers, or in your project&apos;s <code className="text-[var(--accent)]">.cursor/mcp.json</code>.</p>
          </div>
          <div className="rounded-lg border border-[var(--border)]/60 bg-[var(--bg-app)] p-3">
            <div className="font-semibold text-[var(--text-main)] mb-1">Claude Desktop</div>
            <p>Add to your <code className="text-[var(--accent)]">claude_desktop_config.json</code> under the <code className="text-[var(--accent)]">mcpServers</code> key.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
