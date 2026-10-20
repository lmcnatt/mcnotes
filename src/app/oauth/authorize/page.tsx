'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import { ShieldCheck, Check, Server, Loader2, ArrowRight } from 'lucide-react';

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const state = searchParams.get('state') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  const [currentUser, setCurrentUser] = useState<{ username: string } | null>(null);
  const [clientInfo, setClientInfo] = useState<{ client_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline login state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Check current session
        const userRes = await fetch('/api/notes');
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.username) {
            setCurrentUser({ username: userData.username });
          }
        }

        // Fetch client details
        if (clientId) {
          const clientRes = await fetch(`/api/oauth/client?id=${encodeURIComponent(clientId)}`);
          if (clientRes.ok) {
            const data = await clientRes.json();
            setClientInfo(data);
          } else {
            setClientInfo({ client_name: 'External AI Client' });
          }
        }
      } catch {
        // user not logged in
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [clientId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Please enter both username and password');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      setCurrentUser({ username: loginUsername });
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!clientId || !redirectUri || !codeChallenge) {
      setError('Missing required OAuth parameters (client_id, redirect_uri, or code_challenge).');
      return;
    }

    setAuthorizing(true);
    setError(null);
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          state,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error_description || data.error || 'Authorization failed');
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
      setAuthorizing(false);
    }
  };

  const handleDeny = () => {
    if (redirectUri) {
      const target = new URL(redirectUri);
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'The user denied the authorization request');
      if (state) target.searchParams.set('state', state);
      window.location.href = target.toString();
    } else {
      window.close();
    }
  };

  if (loading) {
    return (
      <AuthCard title="Connecting Client" subtitle="Checking authentication…">
        <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
          <Loader2 className="animate-spin text-[var(--accent)]" size={28} />
        </div>
      </AuthCard>
    );
  }

  const clientName = clientInfo?.client_name || 'AI Assistant';

  // If user is NOT logged in: prompt login
  if (!currentUser) {
    return (
      <AuthCard
        title={`Connect to ${clientName}`}
        subtitle="Sign in to your McNotes account to authorize access"
      >
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {loginError && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
              {loginError}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-muted)]">Username</label>
            <input
              type="text"
              required
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Username"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-muted)]">Password</label>
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loginLoading ? 'Signing in…' : 'Sign In & Continue'}
          </button>
        </form>
      </AuthCard>
    );
  }

  // User is logged in: show authorization consent
  return (
    <AuthCard
      title={`Authorize ${clientName}`}
      subtitle={`Signed in as @${currentUser.username}`}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <Server size={24} />
          </div>
          <ArrowRight className="text-[var(--text-muted)]" size={18} />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 font-bold text-sm">
            {clientName.slice(0, 2).toUpperCase()}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-xs text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text-main)] mb-2">
            {clientName} will be granted access to:
          </p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500 shrink-0" />
              <span>List, read, and search all your notes</span>
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500 shrink-0" />
              <span>Create and update notes in your workspace</span>
            </li>
            <li className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500 shrink-0" />
              <span>Find backlinks and cross-references</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-[var(--text-muted)] text-center">
          You can revoke access to this client at any time from your Settings page.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={handleDeny}
            disabled={authorizing}
            className="w-full sm:w-1/2 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={authorizing}
            className="w-full sm:w-1/2 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {authorizing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            Authorize
          </button>
        </div>
      </div>
    </AuthCard>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Connecting" subtitle="Loading authorization details…">
          <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
            <Loader2 className="animate-spin text-[var(--accent)]" size={28} />
          </div>
        </AuthCard>
      }
    >
      <AuthorizeContent />
    </Suspense>
  );
}
