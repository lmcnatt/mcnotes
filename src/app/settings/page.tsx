'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader,
  UserPlus,
  CheckCircle2,
  Users,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Trash2,
} from 'lucide-react';

interface ManagedUser {
  id: number;
  username: string;
  is_admin: number;
  must_change_password: number;
  created_at: string;
  noteCount: number;
  storageBytes: number;
}

type UserAction = 'promote' | 'demote' | 'reset-password' | 'delete';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: string): string {
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export default function SettingsPage() {
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create user state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const router = useRouter();

  // Users list state
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUsername, setCurrentUsername] = useState('');
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userFeedback, setUserFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<{ user: ManagedUser; action: UserAction } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setUsers(data.users || []);
      setCurrentUsername(data.currentUsername || '');
      setUsersError(null);
    } catch (err: any) {
      setUsersError(err.message || 'Failed to load users');
    }
  };

  const adminCount = users.filter((u) => u.is_admin).length;

  /** Returns a reason string if the action is not allowed, otherwise null. */
  const disabledReason = (u: ManagedUser, action: UserAction): string | null => {
    const isSelf = u.username === currentUsername;
    if (action === 'promote' && u.is_admin) return 'Already an admin';
    if (action === 'demote') {
      if (!u.is_admin) return 'Not an admin';
      if (isSelf) return 'You cannot demote yourself';
      if (adminCount <= 1) return 'The last remaining admin cannot be demoted';
    }
    if (action === 'delete') {
      if (isSelf) return 'You cannot delete yourself';
      if (u.is_admin) return 'Demote this admin before deleting';
    }
    return null;
  };

  const openAction = (user: ManagedUser, action: UserAction) => {
    setPending({ user, action });
    setResetPassword('');
    setDialogError(null);
  };

  const confirmAction = async () => {
    if (!pending) return;
    const { user, action } = pending;
    if (action === 'reset-password' && resetPassword.length < 6) {
      setDialogError('Password must be at least 6 characters');
      return;
    }
    setActionBusy(true);
    setDialogError(null);
    try {
      const res =
        action === 'delete'
          ? await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
          : await fetch(`/api/admin/users/${user.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action,
                ...(action === 'reset-password' ? { password: resetPassword } : {}),
              }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Action failed');
      const messages: Record<UserAction, string> = {
        promote: `"@${user.username}" is now an admin.`,
        demote: `"@${user.username}" is no longer an admin.`,
        'reset-password': `Password for "@${user.username}" was reset. They must change it on next sign-in.`,
        delete: `"@${user.username}" was deleted. Their notes were archived.`,
      };
      setUserFeedback({ type: 'success', text: messages[action] });
      setPending(null);
      await loadUsers();
    } catch (err: any) {
      setDialogError(err.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

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
      setAllowRegistration(!next);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError('Username and password are required');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      setCreateSuccess(
        `Account "@${data.username}" created. They will be prompted to set a new password on first login.`
      );
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } catch (err: any) {
      setCreateError(err.message || 'Something went wrong');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] px-4 py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to notes
        </Link>

        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">Admin Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Manage your McNotes instance.</p>
        </div>

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
          <div className="flex flex-col gap-4">
            {/* Registration toggle */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Access
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-[var(--text-main)]">Public registration</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    Allow anyone to create an account on this instance.
                  </span>
                </div>
                {/* Peer-based toggle — thumb is positioned via CSS pseudo-element, never overflows */}
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={allowRegistration}
                    disabled={saving}
                    onChange={() => toggleRegistration(!allowRegistration)}
                  />
                  <span
                    className="
                      relative h-6 w-11 rounded-full border border-transparent transition-colors
                      bg-[var(--border)]
                      peer-checked:bg-[var(--accent)]
                      peer-disabled:cursor-not-allowed peer-disabled:opacity-60
                      after:absolute after:left-0.5 after:top-0.5
                      after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm
                      after:transition-transform after:content-['']
                      peer-checked:after:translate-x-5
                    "
                  />
                </label>
              </div>
            </div>

            {/* Create user */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
              <div className="mb-1 flex items-center gap-2">
                <UserPlus size={18} className="text-[var(--accent)]" />
                <h2 className="font-semibold text-[var(--text-main)]">Create User Account</h2>
              </div>
              <p className="mb-5 text-sm text-[var(--text-muted)]">
                Create an account and share the credentials. The user will be prompted to set their
                own password on first sign-in.
              </p>

              {createError && (
                <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
                  {createSuccess}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-sm font-medium text-[var(--text-muted)]"
                    htmlFor="newUsername"
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="newUsername"
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)]"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. alice"
                    autoComplete="off"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-sm font-medium text-[var(--text-muted)]"
                    htmlFor="newPassword"
                  >
                    Temporary Password
                  </label>
                  <input
                    type="text"
                    id="newPassword"
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 outline-none transition-colors focus:border-[var(--accent)] font-mono tracking-wide"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Temporary password to share"
                    autoComplete="off"
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Share this with the user — they&apos;ll be asked to change it on first sign-in.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={creating}
                >
                  {creating ? 'Creating…' : 'Create Account'}
                </button>
              </form>
            </div>

            {/* Manage users */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Users size={18} className="text-[var(--accent)]" />
                <h2 className="font-semibold text-[var(--text-main)]">Users</h2>
              </div>

              {usersError && (
                <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
                  {usersError}
                </div>
              )}
              {userFeedback && (
                <div
                  className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                    userFeedback.type === 'success'
                      ? 'border-green-500/30 bg-green-500/10 text-green-700'
                      : 'border-red-400/30 bg-red-400/10 text-red-500'
                  }`}
                >
                  {userFeedback.text}
                </div>
              )}

              {(() => {
                const actionButton = (u: ManagedUser, action: UserAction, label: string, icon: React.ReactNode, danger = false) => {
                  const reason = disabledReason(u, action);
                  return (
                    <button
                      key={action}
                      type="button"
                      title={reason || label}
                      disabled={!!reason}
                      onClick={() => openAction(u, action)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        danger
                          ? 'border-red-400/30 text-red-500 hover:bg-red-500/10'
                          : 'border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  );
                };
                const actionsFor = (u: ManagedUser) => (
                  <div className="flex flex-wrap gap-1.5">
                    {u.is_admin
                      ? actionButton(u, 'demote', 'Demote', <ShieldOff size={13} />)
                      : actionButton(u, 'promote', 'Promote', <ShieldCheck size={13} />)}
                    {actionButton(u, 'reset-password', 'Reset password', <KeyRound size={13} />)}
                    {actionButton(u, 'delete', 'Delete', <Trash2 size={13} />, true)}
                  </div>
                );
                const roleBadge = (u: ManagedUser) => (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_admin
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'bg-[var(--bg-sidebar)] text-[var(--text-muted)]'
                    }`}
                  >
                    {u.is_admin ? 'Admin' : 'User'}
                  </span>
                );
                const nameCell = (u: ManagedUser) => (
                  <span className="font-medium text-[var(--text-main)]">
                    @{u.username}
                    {u.username === currentUsername && (
                      <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">(you)</span>
                    )}
                  </span>
                );
                const status = (u: ManagedUser) =>
                  u.must_change_password ? 'Must change password' : 'Active';
                const storage = (u: ManagedUser) =>
                  `${u.noteCount} ${u.noteCount === 1 ? 'note' : 'notes'} · ${formatBytes(u.storageBytes)}`;

                return (
                  <>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            <th className="py-2 pr-3 font-semibold">User</th>
                            <th className="py-2 pr-3 font-semibold">Role</th>
                            <th className="py-2 pr-3 font-semibold">Created</th>
                            <th className="py-2 pr-3 font-semibold">Status</th>
                            <th className="py-2 pr-3 font-semibold">Notes</th>
                            <th className="py-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr key={u.id} className="border-b border-[var(--border)]/50 align-middle">
                              <td className="py-3 pr-3">{nameCell(u)}</td>
                              <td className="py-3 pr-3">{roleBadge(u)}</td>
                              <td className="py-3 pr-3 text-[var(--text-muted)]">{formatDate(u.created_at)}</td>
                              <td className="py-3 pr-3 text-[var(--text-muted)]">{status(u)}</td>
                              <td className="py-3 pr-3 whitespace-nowrap text-[var(--text-muted)]">{storage(u)}</td>
                              <td className="py-3">{actionsFor(u)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {users.map((u) => (
                        <div key={u.id} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4">
                          <div className="flex items-center justify-between gap-2">
                            {nameCell(u)}
                            {roleBadge(u)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            Created {formatDate(u.created_at)} · {status(u)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">{storage(u)}</div>
                          {actionsFor(u)}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <div className="text-lg font-bold text-[var(--text-main)]">Are you sure?</div>
            <p className="text-sm text-[var(--text-muted)]">
              {pending.action === 'promote' && `Promote "@${pending.user.username}" to admin?`}
              {pending.action === 'demote' &&
                `Demote "@${pending.user.username}" to a regular user? Their current session will be signed out.`}
              {pending.action === 'reset-password' &&
                `Set a temporary password for "@${pending.user.username}". They will be signed out and must change it on next sign-in.`}
              {pending.action === 'delete' &&
                `Delete "@${pending.user.username}"? Their notes will be archived (not destroyed) and they will be signed out immediately.`}
            </p>
            {pending.action === 'reset-password' && (
              <input
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Temporary password (min 6 characters)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-2.5 font-mono text-sm tracking-wide text-[var(--text-main)] outline-none transition-colors focus:border-[var(--accent)]"
              />
            )}
            {dialogError && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-500">
                {dialogError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setPending(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={confirmAction}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                  pending.action === 'delete'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
                }`}
              >
                {actionBusy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
