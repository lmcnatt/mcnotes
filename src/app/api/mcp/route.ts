import { EventEmitter } from 'events';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
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

interface StreamableSession {
  sessionId: string;
  userId: string;
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

const sessions = new Map<string, McpSession>();
const streamableSessions = new Map<string, StreamableSession>();
const userLastStreamableSessionId = new Map<string, string>();

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
  for (const [id, session] of streamableSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      try {
        session.transport.close();
      } catch {}
      streamableSessions.delete(id);
      if (userLastStreamableSessionId.get(session.userId) === id) {
        userLastStreamableSessionId.delete(session.userId);
      }
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
  const server = new McpServer(
    {
      name: 'McNotes',
      version: '1.0.0',
    },
    {
      instructions:
        "You are connected to McNotes, the user's personal self-hosted markdown notebook and knowledge base.\n" +
        "You have the user's explicit authorization and permission to access, list, search, read, and write their personal notes in this workspace.\n" +
        "When the user asks questions about their notes, books, summaries, ideas, quotes, or thoughts, proactively call the McNotes tools ('search_notes', 'list_notes', 'read_note') to retrieve the answers directly from their workspace.\n" +
        "Never say you do not have access to their personal notes — you have direct, authorized access through these tools.",
    }
  );

  server.tool(
    'list_notes',
    "List all folders, subfolders, and markdown notes stored in the user's personal McNotes workspace.",
    {},
    async () => {
      console.log(`[MCP TOOL] list_notes called for user: ${userId}`);
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
        console.error(`[MCP TOOL ERROR] list_notes:`, err);
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
    "Read the full markdown content of a personal note from the user's McNotes workspace by its relative path (e.g. 'Soveris/7 Habits/Key Points.md' or 'Links to Share/Notes.md').",
    {
      path: z.string().describe("Relative path to the note (e.g. 'Soveris/7 Habits/Key Points.md')"),
    },
    async ({ path: notePath }) => {
      console.log(`[MCP TOOL] read_note called for user: ${userId}, path: "${notePath}"`);
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
        console.error(`[MCP TOOL ERROR] read_note for "${notePath}":`, err);
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
    "Save or update a personal note in McNotes with the specified markdown content.",
    {
      path: z.string().describe("Relative path to the note (e.g. 'Soveris/7 Habits/Key Points.md')"),
      content: z.string().describe('Full markdown content to write to the note'),
    },
    async ({ path: notePath, content }) => {
      console.log(`[MCP TOOL] save_note called for user: ${userId}, path: "${notePath}"`);
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
        console.error(`[MCP TOOL ERROR] save_note:`, err);
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
    "Search across all the user's personal notes in McNotes for matching keywords, topics, text, or titles.",
    {
      query: z.string().describe("Search term or keyword to find within the user's personal notes"),
    },
    async ({ query }) => {
      console.log(`[MCP TOOL] search_notes called for user: ${userId}, query: "${query}"`);
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
        console.error(`[MCP TOOL ERROR] search_notes:`, err);
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
    "Find all personal notes in McNotes that link to the specified note path.",
    {
      path: z.string().describe("Relative path of the target note (e.g. 'reference.md')"),
    },
    async ({ path: notePath }) => {
      console.log(`[MCP TOOL] get_backlinks called for user: ${userId}, path: "${notePath}"`);
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
        console.error(`[MCP TOOL ERROR] get_backlinks:`, err);
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

  server.resource(
    'personal-notes',
    new ResourceTemplate('notes://{path}', { list: undefined }),
    {
      description: "User's personal notes and markdown documents in McNotes",
      mimeType: 'text/markdown',
    },
    async (uri, { path: notePath }) => {
      console.log(`[MCP RESOURCE] read resource: ${uri.href}`);
      const content = getNote(userId, String(notePath));
      return {
        contents: [
          {
            uri: uri.href,
            text: content,
            mimeType: 'text/markdown',
          },
        ],
      };
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
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

    const headerSessionId = request.headers.get('mcp-session-id');
    if (headerSessionId && streamableSessions.has(headerSessionId)) {
      const streamableSession = streamableSessions.get(headerSessionId)!;
      if (streamableSession.userId === auth.userId) {
        return streamableSession.transport.handleRequest(request);
      }
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const sseRes = new SSEStreamResponse(writer);

    const origin = getOrigin(request);
    const url = new URL(request.url);
    const rawToken = url.searchParams.get('token');
    const endpointUrl = rawToken ? `${origin}/api/mcp?token=${encodeURIComponent(rawToken)}` : `${origin}/api/mcp`;

    const transport = new SSEServerTransport(endpointUrl, sseRes as any);
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
    const querySessionId = url.searchParams.get('sessionId');

    if (!querySessionId) {
      // Streamable HTTP transport (e.g. Gemini Connectors, modern web MCP clients)
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

      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response('Invalid JSON body', {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      console.log(`[MCP POST] user=${auth.userId} method=${body?.method} tool=${body?.params?.name} id=${body?.id}`);

      cleanupStaleSessions();

      const headerSessionId = request.headers.get('mcp-session-id');
      let streamableSession = headerSessionId ? streamableSessions.get(headerSessionId) : undefined;

      // Fallback for clients or proxies that omit mcp-session-id on subsequent requests
      if (!streamableSession && body?.method !== 'initialize') {
        const fallbackId = userLastStreamableSessionId.get(auth.userId);
        if (fallbackId && streamableSessions.has(fallbackId)) {
          streamableSession = streamableSessions.get(fallbackId);
        }
      }

      if (!streamableSession) {
        const newSessionId = crypto.randomUUID();
        const server = createScopedMcpServer(auth.userId);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        streamableSession = {
          sessionId: newSessionId,
          userId: auth.userId,
          transport,
          server,
          createdAt: Date.now(),
        };
        streamableSessions.set(newSessionId, streamableSession);
      } else if (streamableSession.userId !== auth.userId) {
        return new Response('Forbidden', {
          status: 403,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      userLastStreamableSessionId.set(auth.userId, streamableSession.sessionId);

      // Ensure Accept header satisfies MCP Streamable HTTP spec
      const reqHeaders = new Headers(request.headers);
      const existingAccept = reqHeaders.get('accept') || '';
      if (!existingAccept.includes('application/json') || !existingAccept.includes('text/event-stream')) {
        reqHeaders.set('accept', 'application/json, text/event-stream');
      }

      // Ensure transport sees the correct session ID header
      if (!reqHeaders.has('mcp-session-id') && streamableSession.sessionId) {
        reqHeaders.set('mcp-session-id', streamableSession.sessionId);
      }

      const reqForTransport = new Request(request.url, {
        method: request.method,
        headers: reqHeaders,
      });

      const response = await streamableSession.transport.handleRequest(reqForTransport, {
        parsedBody: body,
      });

      const resHeaders = new Headers(response.headers);
      resHeaders.set('Access-Control-Allow-Origin', '*');
      resHeaders.set('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

      return new Response(response.body, {
        status: response.status,
        headers: resHeaders,
      });
    }

    const session = sessions.get(querySessionId);
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
