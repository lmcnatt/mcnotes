import { NextResponse } from 'next/server';
import { checkRenameLinks } from '@/lib/links';

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

    const result = checkRenameLinks(username, oldPath, newPath);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to check rename links:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
