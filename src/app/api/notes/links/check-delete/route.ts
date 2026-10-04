import { NextResponse } from 'next/server';
import { checkIncomingLinks } from '@/lib/links';

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

    const result = checkIncomingLinks(username, path);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to check incoming links:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
