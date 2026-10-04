import { NextResponse } from 'next/server';
import { getAllNotesAndFolders } from '@/lib/links';

export async function GET(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const items = getAllNotesAndFolders(username);
    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('Failed to get all notes and folders:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
