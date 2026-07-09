import { NextResponse } from 'next/server';
import { searchNotes } from '@/lib/notes';

export async function GET(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const results = searchNotes(username, query);
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Failed to search notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
