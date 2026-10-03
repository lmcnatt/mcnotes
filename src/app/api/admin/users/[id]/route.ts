import { NextResponse } from 'next/server';
import {
  getUserByUsername,
  getUserById,
  countAdmins,
  setUserAdmin,
  adminResetUserPassword,
  deleteUserRecords,
} from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { archiveUserFolder, restoreArchivedFolder } from '@/lib/admin-users';

function getAdmin(request: Request) {
  const username = request.headers.get('x-user-username');
  if (!username) return null;
  const user = getUserByUsername(username);
  if (!user || !user.is_admin) return null;
  return user;
}

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number.parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const admin = getAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const target = getUserById(id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  let body: { action?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  switch (body.action) {
    case 'promote': {
      if (target.is_admin) {
        return NextResponse.json({ error: 'User is already an admin' }, { status: 409 });
      }
      setUserAdmin(target.id, true);
      return NextResponse.json({ success: true });
    }
    case 'demote': {
      if (target.id === admin.id) {
        return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 });
      }
      if (!target.is_admin) {
        return NextResponse.json({ error: 'User is not an admin' }, { status: 409 });
      }
      if (countAdmins() <= 1) {
        return NextResponse.json(
          { error: 'The last remaining admin cannot be demoted' },
          { status: 409 }
        );
      }
      setUserAdmin(target.id, false);
      return NextResponse.json({ success: true });
    }
    case 'reset-password': {
      const password = body.password;
      if (typeof password !== 'string' || password.trim() === '') {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        );
      }
      adminResetUserPassword(target.id, await hashPassword(password));
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const admin = getAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const target = getUserById(id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.id === admin.id) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  }
  if (target.is_admin) {
    return NextResponse.json(
      { error: 'Admins cannot be deleted. Demote this user first.' },
      { status: 409 }
    );
  }

  // Move the folder first (notes are never destroyed), then remove DB records.
  let archive: { from: string; to: string } | null = null;
  try {
    archive = archiveUserFolder(target.username);
  } catch (err) {
    console.error('Failed to archive user folder:', err);
    return NextResponse.json({ error: 'Failed to archive user notes' }, { status: 500 });
  }

  try {
    deleteUserRecords(target.id, target.username);
  } catch (err) {
    console.error('Failed to delete user records:', err);
    if (archive) {
      try {
        restoreArchivedFolder(archive);
      } catch (restoreErr) {
        console.error('Failed to restore archived folder:', restoreErr);
      }
    }
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }

  return NextResponse.json({ success: true, archivedTo: archive?.to ?? null });
}
