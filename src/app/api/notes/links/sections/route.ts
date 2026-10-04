import { NextResponse } from 'next/server';
import { readNote, writeNote } from '@/lib/notes';
import { extractHeadingsAndParagraphs } from '@/lib/links';

export async function GET(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const notePath = searchParams.get('path');
    if (!notePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const content = readNote(username, notePath);
    const sections = extractHeadingsAndParagraphs(content);
    return NextResponse.json(sections);
  } catch (error: any) {
    console.error('Failed to get sections:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST endpoint: appends an auto-generated block ID to a paragraph at a given line in the target note if none exists
export async function POST(request: Request) {
  try {
    const username = request.headers.get('x-user-username');
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path: notePath, line, id } = await request.json();
    if (!notePath || line === undefined || !id) {
      return NextResponse.json({ error: 'path, line, and id are required' }, { status: 400 });
    }

    const content = readNote(username, notePath);
    const lines = content.split('\n');
    const lineIdx = line - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) {
      return NextResponse.json({ error: 'Line out of bounds' }, { status: 400 });
    }

    // Check if line already has a block id
    const match = lines[lineIdx].match(/\s+\^([a-zA-Z0-9_-]+)$/);
    let finalId = id;
    if (match) {
      finalId = match[1];
    } else {
      lines[lineIdx] = `${lines[lineIdx].trimEnd()} ^${id}`;
      writeNote(username, notePath, lines.join('\n'));
    }

    return NextResponse.json({ success: true, id: finalId });
  } catch (error: any) {
    console.error('Failed to add block ID:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
