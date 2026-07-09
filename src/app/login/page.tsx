'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setLoading(false);

    try {
      setLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] p-4 sm:p-6">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow)] sm:p-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="[font-family:var(--font-serif)] text-[2rem] font-bold tracking-tight text-[var(--accent)] sm:text-[2.2rem]">
            Mcnatt Notes
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-main)] sm:text-xl">Welcome Back</h1>
          <p className="text-sm text-[var(--text-muted)]">Sign in to continue writing your books</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.85rem] font-medium text-[var(--text-muted)]" htmlFor="username">
              Username
            </label>
            <input
              type="text"
              id="username"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 text-[0.95rem] text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent)]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[0.85rem] font-medium text-[var(--text-muted)]" htmlFor="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 text-[0.95rem] text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-xl bg-[var(--accent)] py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-sm text-[var(--text-muted)]">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-[var(--accent)] hover:underline">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
