import { NextResponse } from 'next/server';
import { readNote, writeNote } from '@/lib/notes';

export async function GET(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const content = readNote(username, path);
    return NextResponse.json({ content });
  } catch (error: any) {
    console.error('Failed to read note:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path, content } = await request.json();
    if (!path || content === undefined) {
      return NextResponse.json({ error: 'Path and content are required' }, { status: 400 });
    }

    writeNote(username, path, content);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to save note:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
