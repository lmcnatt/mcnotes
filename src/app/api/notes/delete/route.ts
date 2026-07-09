import { NextResponse } from 'next/server';
import { deleteItem } from '@/lib/notes';
import { deleteNodeMetadata } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await request.json();
    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    deleteItem(username, path);
    deleteNodeMetadata(username, path);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete item:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

