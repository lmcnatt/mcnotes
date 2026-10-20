import { getSessionUser } from '../../../lib/auth.ts';
import { createApiToken, listApiTokens, revokeApiToken } from '../../../lib/db.ts';

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokens = await listApiTokens(String(user.id));
    return Response.json({ tokens });
  } catch (error: any) {
    console.error('Failed to list tokens:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = body?.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Token name is required' }, { status: 400 });
    }

    const tokenData = await createApiToken(String(user.id), name.trim());
    return Response.json(
      {
        id: tokenData.id,
        name: name.trim(),
        rawToken: tokenData.rawToken,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Failed to create token:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return Response.json({ error: 'Token ID is required' }, { status: 400 });
    }

    await revokeApiToken(String(user.id), id);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Failed to revoke token:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
