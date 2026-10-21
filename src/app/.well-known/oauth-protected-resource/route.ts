export const dynamic = 'force-dynamic';

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const origin = getOrigin(request);
  const metadata = {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcnotes'],
    bearer_methods_supported: ['header'],
    resource_name: 'McNotes MCP Server',
  };

  return Response.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
