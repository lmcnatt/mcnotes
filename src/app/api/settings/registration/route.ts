import { NextResponse } from 'next/server';
import { getUserByUsername, getSetting, setSetting } from '@/lib/db';

// Resolve the authenticated admin from the username injected by the middleware.
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
  return NextResponse.json({ allowRegistration: getSetting('allow_registration') === '1' });
}

export async function POST(request: Request) {
  const admin = getAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowRegistration } = await request.json();
  if (typeof allowRegistration !== 'boolean') {
    return NextResponse.json({ error: 'allowRegistration must be a boolean' }, { status: 400 });
  }

  setSetting('allow_registration', allowRegistration ? '1' : '0');
  return NextResponse.json({ allowRegistration });
}
