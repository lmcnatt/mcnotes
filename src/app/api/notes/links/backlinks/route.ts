import { NextResponse } from 'next/server';
import { findBacklinks } from '@/lib/links';

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

    const backlinks = findBacklinks(username, path);
    return NextResponse.json({ backlinks });
  } catch (error: any) {
    console.error('Failed to get backlinks:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
