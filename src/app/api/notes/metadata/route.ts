import { NextResponse } from 'next/server';
import { setNodeEmoji } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path, emoji } = await request.json();
    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    setNodeEmoji(username, path, emoji);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to set node metadata:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
