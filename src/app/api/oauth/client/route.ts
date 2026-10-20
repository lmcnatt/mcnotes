import { getOAuthClient } from '../../../../lib/db.ts';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return Response.json(
      { error: 'Missing client id' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
  const client = getOAuthClient(id);
  if (!client) {
    return Response.json(
      { error: 'Client not found' },
      { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
  return Response.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
