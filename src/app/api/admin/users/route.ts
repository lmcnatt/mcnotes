import { NextResponse } from 'next/server';
import { getUserByUsername, createUser, getAllUsers } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { getUserDir } from '@/lib/notes';
import { getUserFolderStats } from '@/lib/admin-users';

function getAdmin(request: Request) {
  const username = request.headers.get('x-user-username');
  if (!username) return null;
  const user = getUserByUsername(username);
  if (!user || !user.is_admin) return null;
  return user;
}

export async function GET(request: Request) {
  const admin = getAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const users = getAllUsers().map((u) => ({ ...u, ...getUserFolderStats(u.username) }));
  return NextResponse.json({ users, currentUsername: admin.username });
}

export async function POST(request: Request) {
  const admin = getAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { username, password } = await request.json();

  if (
    !username ||
    !password ||
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim() === '' ||
    password.trim() === ''
  ) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters' },
      { status: 400 }
    );
  }

  const cleanUsername = username.trim().toLowerCase();

  const existing = getUserByUsername(cleanUsername);
  if (existing) {
    return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = createUser(cleanUsername, passwordHash, false, true); // mustChangePassword = true
  getUserDir(cleanUsername);

  return NextResponse.json({ success: true, username: user.username }, { status: 201 });
}
