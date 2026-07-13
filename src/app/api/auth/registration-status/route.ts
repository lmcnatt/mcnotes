import { NextResponse } from 'next/server';
import { getUserCount, isRegistrationAllowed } from '@/lib/db';

// Public endpoint used by the login/register pages to decide whether to show
// the "Create account" link and whether this is a first-run (no users yet).
export async function GET() {
  return NextResponse.json({
    allowRegistration: isRegistrationAllowed(),
    hasUsers: getUserCount() > 0,
  });
}
