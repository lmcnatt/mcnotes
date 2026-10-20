import { EventEmitter } from 'events';
import path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { verifyApiToken } from '../../../lib/db.ts';
import { listTree, getNote, saveNote, searchNotes } from '../../../lib/notes.ts';
import { getBacklinksForNote } from '../../../lib/links.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

class SSEStreamResponse extends EventEmitter {
  public statusCode = 200;
  public headers: Record<string, string> = {};
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private encoder = new TextEncoder();
  public finished = false;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
    super();
    this.writer = writer;
  }

  writeHead(statusCode: number, headers?: Record<string, string>) {
    this.statusCode = statusCode;
    if (headers) {
      Object.assign(this.headers, headers);
    }
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  getHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }

  write(chunk: any): boolean {
    if (this.finished) return false;
    const data = typeof chunk === 'string' ? this.encoder.encode(chunk) : chunk;
    this.writer.write(data).catch(() => {
      this.emit('close');
    });
    return true;
  }

  end(chunk?: any) {
    if (this.finished) return this;
    this.finished = true;
    if (chunk) {
      this.write(chunk);
    }
    this.writer.close().catch(() => {});
    this.emit('close');
    return this;
  }

  flushHeaders() {}
  flush() {}
}

interface McpSession {
  sessionId: string;
  userId: string;
  transport: SSEServerTransport;
  server: McpServer;
  createdAt: number;
}

const sessions = new Map<string, McpSession>();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      try {
        session.transport.close();
      } catch {}
      sessions.delete(id);
    }
  }
}

async function authenticateRequest(request: Request): Promise<{ userId: string; tokenId: string } | null> {
  const authHeader = request.headers.get('authorization') || '';
  let token: string | null = null;
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.substring(7).trim();
  }
  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get('token');
  }
  if (!token) {
    return null;
  }
  return verifyApiToken(token);
}

function createScopedMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: 'mcnotes',
    version: '1.0.0',
  });

  server.tool(
    'list_notes',
    'List all notes and directories in your mcnotes workspace',
    {},
    async () => {
      try {
        const tree = listTree(userId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing notes: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'read_note',
    'Read the markdown content of a note by its relative path',
    {
      path: z.string().describe('Relative path to the note (e.g. "meeting-notes.md" or "work/project.md")'),
    },
    async ({ path: notePath }) => {
      try {
        if (notePath.includes('..') || path.isAbsolute(notePath)) {
          throw new Error('Access denied: Path traversal detected');
        }
        const content = getNote(userId, notePath);
        return {
          content: [
            {
              type: 'text' as const,
              text: content,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error reading note: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'save_note',
    'Save or update a note with the specified markdown content',
    {
      path: z.string().describe('Relative path to the note (e.g. "meeting-notes.md" or "work/project.md")'),
      content: z.string().describe('Full markdown content to write to the note'),
    },
    async ({ path: notePath, content }) => {
      try {
        if (notePath.includes('..') || path.isAbsolute(notePath)) {
          throw new Error('Access denied: Path traversal detected');
        }
        saveNote(userId, notePath, content);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Successfully saved note: ${notePath}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error saving note: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'search_notes',
    'Search across all notes for matching text or titles',
    {
      query: z.string().describe('Search term or phrase to query'),
    },
    async ({ query }) => {
      try {
        const results = searchNotes(userId, query);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error searching notes: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'get_backlinks',
    'Find all notes that link to the specified note path',
    {
      path: z.string().describe('Relative path of the target note (e.g. "reference.md")'),
    },
    async ({ path: notePath }) => {
      try {
        const backlinks = getBacklinksForNote(userId, notePath);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(backlinks, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error getting backlinks: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      const origin = getOrigin(request);
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          'Link': `<${origin}/.well-known/oauth-authorization-server>; rel="oauth-authorization-server"`,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    cleanupStaleSessions();

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const sseRes = new SSEStreamResponse(writer);

    const url = new URL(request.url);
    const rawToken = url.searchParams.get('token');
    const endpointPath = rawToken ? `/api/mcp?token=${encodeURIComponent(rawToken)}` : '/api/mcp';

    const transport = new SSEServerTransport(endpointPath, sseRes as any);
    const server = createScopedMcpServer(auth.userId);

    const sessionId = transport.sessionId;
    sessions.set(sessionId, {
      sessionId,
      userId: auth.userId,
      transport,
      server,
      createdAt: Date.now(),
    });

    transport.onclose = () => {
      sessions.delete(sessionId);
    };

    request.signal.addEventListener('abort', () => {
      sessions.delete(sessionId);
      sseRes.emit('close');
      sseRes.end();
    });

    await server.connect(transport);

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Failed to establish MCP SSE stream:', error);
    return new Response(error.message || 'Internal server error', {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      const auth = await authenticateRequest(request);
      if (!auth) {
        const origin = getOrigin(request);
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
            'Link': `<${origin}/.well-known/oauth-authorization-server>; rel="oauth-authorization-server"`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Missing sessionId parameter', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return new Response('Session not found', {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const auth = await authenticateRequest(request);
    if (auth && auth.userId !== session.userId) {
      return new Response('Forbidden', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON body', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    let postStatus = 202;
    let postBody = 'Accepted';

    const postRes = {
      writeHead(status: number) {
        postStatus = status;
        return this;
      },
      end(content?: string) {
        if (content !== undefined) postBody = content;
        return this;
      },
    };

    const mockReq = {
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'content-type': 'application/json',
      },
      url: request.url,
      auth: undefined,
      socket: { encrypted: request.url.startsWith('https') },
    };

    await session.transport.handlePostMessage(mockReq as any, postRes as any, body);

    return new Response(postBody, {
      status: postStatus,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    });
  } catch (error: any) {
    console.error('Failed to process MCP POST message:', error);
    return new Response(error.message || 'Internal server error', {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
