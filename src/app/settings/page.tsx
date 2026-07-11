'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader } from 'lucide-react';

export default function SettingsPage() {
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/settings/registration')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setAllowRegistration(!!data.allowRegistration);
      })
      .catch(() => setForbidden(true))
      .finally(() => setLoading(false));
  }, [router]);

  const toggleRegistration = async (next: boolean) => {
    setSaving(true);
    setAllowRegistration(next);
    try {
      const res = await fetch('/api/settings/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowRegistration: next }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      const data = await res.json();
      setAllowRegistration(!!data.allowRegistration);
    } catch {
      // Revert on failure
      setAllowRegistration(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <ArrowLeft size={16} />
          Back to notes
        </Link>

        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Admin Settings</h1>

        {loading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader className="animate-spin" size={18} /> Loading…
          </div>
        ) : forbidden ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--text-muted)]">
            You do not have permission to view this page. Only the instance administrator can manage
            settings.
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-[var(--text-main)]">Public registration</span>
                <span className="text-sm text-[var(--text-muted)]">
                  Allow anyone to create an account on this instance.
                </span>
              </div>
              <button
                role="switch"
                aria-checked={allowRegistration}
                disabled={saving}
                onClick={() => toggleRegistration(!allowRegistration)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  allowRegistration ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    allowRegistration ? 'translate-x-[1.4rem]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
