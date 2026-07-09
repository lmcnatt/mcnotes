import { NextResponse } from 'next/server';
import { renameItem } from '@/lib/notes';

export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { oldPath, newPath } = await request.json();
    if (!oldPath || !newPath) {
      return NextResponse.json({ error: 'oldPath and newPath are required' }, { status: 400 });
    }

    const finalPath = renameItem(username, oldPath, newPath);
    return NextResponse.json({ success: true, relativePath: finalPath });
  } catch (error: any) {
    console.error('Failed to rename item:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
