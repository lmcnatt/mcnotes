'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/registration-status')
      .then((res) => res.json())
      .then((data) => setAllowRegistration(!!data.allowRegistration))
      .catch(() => setAllowRegistration(false));
  }, []);

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-7 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow)]">

        {/* Header */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-[0.04rem]">
            <Image
              src="/branding/logos/mcnotes-app-badge.png"
              alt="McNotes badge"
              width={52}
              height={52}
              className="h-[3.2rem] w-[3.2rem] rounded-2xl object-cover border border-border-theme/70 shadow-sm"
              priority
            />
            <span className="text-[2.28rem] leading-none tracking-[-0.05em] font-semibold text-[#433328] [font-family:var(--font-logo)] -translate-y-[2px] transform">Notes</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-main)]">Welcome Back</h1>
          <p className="text-sm text-[var(--text-muted)]">Sign in to continue writing your books</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="username">
              Username
            </label>
            <input
              type="text"
              id="username"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-muted)]" htmlFor="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="mt-1 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Footer link */}
        {allowRegistration && (
          <p className="text-center text-sm text-[var(--text-muted)]">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
              Create account
            </Link>
          </p>
        )}

      </div>
    </div>
  );
}
