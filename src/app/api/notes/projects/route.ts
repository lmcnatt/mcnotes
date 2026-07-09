import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getUserDir } from '@/lib/notes';

export async function GET(req: Request) {
  const username = req.headers.get('x-user-username');
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userDir = getUserDir(username);
    
    // Ensure migration runs on list
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    
    // Check if there are legacy files and run migration
    const hasLegacy = entries.some(entry => !entry.name.startsWith('.') && (!entry.isDirectory() || entry.name !== 'My Book'));
    if (hasLegacy && !fs.existsSync(path.join(userDir, 'My Book'))) {
      const myBookDir = path.join(userDir, 'My Book');
      if (!fs.existsSync(myBookDir)) {
        fs.mkdirSync(myBookDir, { recursive: true });
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'My Book') continue;
        fs.renameSync(path.join(userDir, entry.name), path.join(myBookDir, entry.name));
      }
    } else if (entries.filter(e => !e.name.startsWith('.')).length === 0) {
      const myBookDir = path.join(userDir, 'My Book');
      if (!fs.existsSync(myBookDir)) {
        fs.mkdirSync(myBookDir, { recursive: true });
      }
    }

    // Read projects
    const { getAllNodeMetadata } = await import('@/lib/db');
    const metadata = getAllNodeMetadata(username);

    const updatedEntries = fs.readdirSync(userDir, { withFileTypes: true });
    const projects = updatedEntries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        emoji: metadata[entry.name]?.emoji || ''
      }));

    return NextResponse.json({ projects });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const username = req.headers.get('x-user-username');
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await req.json();
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }

    const cleanName = name.replace(/[\/\\?%*:|"<>\.]/g, '').trim();
    if (!cleanName) {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }

    const userDir = getUserDir(username);
    const projectDir = path.join(userDir, cleanName);

    if (fs.existsSync(projectDir)) {
      return NextResponse.json({ error: 'Project already exists' }, { status: 400 });
    }

    fs.mkdirSync(projectDir, { recursive: true });
    return NextResponse.json({ success: true, name: cleanName });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const username = req.headers.get('x-user-username');
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { oldName, newName, emoji } = await req.json();
    if (!oldName || typeof oldName !== 'string') {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const userDir = getUserDir(username);
    const oldDir = path.normalize(path.join(userDir, oldName));

    console.log("PATCH PROJECT RENAME LOG:", {
      username,
      oldName,
      userDir,
      oldDir,
      exists: fs.existsSync(oldDir)
    });

    if (!oldDir.startsWith(userDir) || !fs.existsSync(oldDir)) {
      return NextResponse.json({ error: 'Project does not exist' }, { status: 404 });
    }

    let finalName = oldName;
    if (newName && typeof newName === 'string' && newName.trim() !== '') {
      const cleanNewName = newName.replace(/[\/\\?%*:|"<>\.]/g, '').trim();
      if (!cleanNewName) {
        return NextResponse.json({ error: 'Invalid new project name' }, { status: 400 });
      }
      
      const newDir = path.join(userDir, cleanNewName);
      if (cleanNewName !== oldName) {
        if (fs.existsSync(newDir)) {
          return NextResponse.json({ error: 'Project name already in use' }, { status: 400 });
        }
        
        fs.renameSync(oldDir, newDir);
        // Update database paths
        const { updateMetadataPaths } = await import('@/lib/db');
        updateMetadataPaths(username, oldName, cleanNewName);
        finalName = cleanNewName;
      }
    }

    // Set emoji
    if (emoji !== undefined) {
      const { setNodeEmoji } = await import('@/lib/db');
      setNodeEmoji(username, finalName, emoji);
    }

    return NextResponse.json({ success: true, name: finalName });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const username = req.headers.get('x-user-username');
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name } = await req.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }

    const userDir = getUserDir(username);
    const projectDir = path.normalize(path.join(userDir, name));

    if (!projectDir.startsWith(userDir) || projectDir === userDir) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
