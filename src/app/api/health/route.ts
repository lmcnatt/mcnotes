import { NextResponse } from 'next/server';
import db from '@/lib/db';

// Lightweight liveness/readiness probe used by Docker/orchestrators.
// Confirms the process is up and the SQLite database is reachable.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    db.prepare('SELECT 1').get();
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
