import { NextResponse } from 'next/server';
import { getNotesTree, createItem } from '@/lib/notes';

export async function GET(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tree = getNotesTree(username);
    return NextResponse.json({ tree, username });
  } catch (error: any) {
    console.error('Failed to get notes tree:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, parentPath, name } = await request.json();
    if (!name || !type || (type !== 'file' && type !== 'directory')) {
      return NextResponse.json({ error: 'Name and valid type (file/directory) are required' }, { status: 400 });
    }

    const relativePath = createItem(username, parentPath || '', name, type);
    return NextResponse.json({ success: true, relativePath });
  } catch (error: any) {
    console.error('Failed to create item:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
