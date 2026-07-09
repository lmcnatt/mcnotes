import fs from 'fs';
import path from 'path';

const BASE_NOTES_DIR = '/mnt/mcnatt-storage/notes/users';

export interface FileNode {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  children?: FileNode[];
}

export function getUserDir(username: string): string {
  const userDir = path.join(BASE_NOTES_DIR, username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

export function resolveUserPath(username: string, relativePath: string): string {
  const userDir = getUserDir(username);
  
  // Resolve path and prevent directory traversal
  const resolvedPath = path.normalize(path.join(userDir, relativePath));
  
  if (!resolvedPath.startsWith(userDir)) {
    throw new Error('Access denied: Path traversal detected');
  }
  
  return resolvedPath;
}

export function getNotesTree(username: string, currentDir: string = ''): FileNode[] {
  const userDir = getUserDir(username);
  const targetDir = path.join(userDir, currentDir);
  
  if (!fs.existsSync(targetDir)) return [];
  
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const nodes: FileNode[] = [];
  
  for (const entry of entries) {
    // Ignore hidden files and directories
    if (entry.name.startsWith('.')) continue;
    
    const relPath = path.join(currentDir, entry.name);
    const node: FileNode = {
      name: entry.name,
      relativePath: relPath,
      isDirectory: entry.isDirectory(),
    };
    
    if (entry.isDirectory()) {
      node.children = getNotesTree(username, relPath);
      // Sort: directories first, then alphabetically
      nodes.push(node);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stats = fs.statSync(path.join(targetDir, entry.name));
      node.size = stats.size;
      nodes.push(node);
    }
  }
  
  // Sort: folders first, then files alphabetically
  return nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function readNote(username: string, relativePath: string): string {
  const absolutePath = resolveUserPath(username, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error('File not found');
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

export function writeNote(username: string, relativePath: string, content: string): void {
  const absolutePath = resolveUserPath(username, relativePath);
  
  // Ensure the parent directory exists
  const parentDir = path.dirname(absolutePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  
  fs.writeFileSync(absolutePath, content, 'utf8');
}

export function createItem(username: string, parentPath: string, name: string, type: 'file' | 'directory'): string {
  const cleanName = name.replace(/[\/\\?%*:|"<>]/g, '-'); // Sanitize filename
  const finalName = type === 'file' ? (cleanName.endsWith('.md') ? cleanName : `${cleanName}.md`) : cleanName;
  
  const relPath = path.join(parentPath, finalName);
  const absolutePath = resolveUserPath(username, relPath);
  
  if (fs.existsSync(absolutePath)) {
    throw new Error('Item already exists');
  }
  
  if (type === 'file') {
    fs.writeFileSync(absolutePath, '# ' + cleanName.replace('.md', '') + '\n\nStart writing here...', 'utf8');
  } else {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
  
  return relPath;
}

export function renameItem(username: string, oldPath: string, newPath: string): string {
  const absoluteOld = resolveUserPath(username, oldPath);
  
  // Ensure the extension is preserved if it's a markdown file
  let finalNewPath = newPath;
  if (fs.statSync(absoluteOld).isFile() && !newPath.endsWith('.md')) {
    finalNewPath = `${newPath}.md`;
  }
  
  const absoluteNew = resolveUserPath(username, finalNewPath);
  
  if (fs.existsSync(absoluteNew)) {
    throw new Error('Target path already exists');
  }
  
  const parentDir = path.dirname(absoluteNew);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  
  fs.renameSync(absoluteOld, absoluteNew);
  return finalNewPath;
}

export function deleteItem(username: string, relativePath: string): void {
  const absolutePath = resolveUserPath(username, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error('Item not found');
  }
  
  const stats = fs.statSync(absolutePath);
  if (stats.isDirectory()) {
    fs.rmSync(absolutePath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(absolutePath);
  }
}

interface SearchResult {
  relativePath: string;
  title: string;
  matches: { line: number; text: string }[];
}

export function searchNotes(username: string, query: string): SearchResult[] {
  const userDir = getUserDir(username);
  const results: SearchResult[] = [];
  const lowercaseQuery = query.toLowerCase();
  
  function traverse(currentDir: string = '') {
    const targetDir = path.join(userDir, currentDir);
    if (!fs.existsSync(targetDir)) return;
    
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        traverse(relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const absolutePath = path.join(targetDir, entry.name);
        const content = fs.readFileSync(absolutePath, 'utf8');
        
        // Simple line matching
        const lines = content.split('\n');
        const matches: { line: number; text: string }[] = [];
        
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(lowercaseQuery)) {
            matches.push({
              line: index + 1,
              text: line.trim()
            });
          }
        });
        
        if (matches.length > 0 || entry.name.toLowerCase().includes(lowercaseQuery)) {
          // Extract title (first H1 or filename)
          const firstH1 = lines.find(l => l.startsWith('# '));
          const title = firstH1 ? firstH1.substring(2).trim() : entry.name.replace('.md', '');
          
          results.push({
            relativePath: relPath,
            title,
            matches: matches.slice(0, 5) // Limit to 5 matches per file
          });
        }
      }
    }
  }
  
  traverse();
  return results;
}
