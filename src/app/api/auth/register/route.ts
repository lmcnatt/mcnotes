import { NextResponse } from 'next/server';
import { getUserByUsername, createUser, getUserCount, isRegistrationAllowed } from '@/lib/db';
import { hashPassword, signJWT } from '@/lib/auth';
import { getUserDir } from '@/lib/notes';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // The first account bootstraps the instance and becomes the admin.
    // After that, self-registration must be explicitly enabled.
    const isFirstUser = getUserCount() === 0;
    if (!isRegistrationAllowed()) {
      return NextResponse.json(
        { error: 'Registration is currently disabled on this instance.' },
        { status: 403 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if user exists
    const existingUser = getUserByUsername(cleanUsername);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    // Hash password & create user (first user is granted admin rights)
    const passwordHash = await hashPassword(password);
    createUser(cleanUsername, passwordHash, isFirstUser);

    // Create user's notes directory
    getUserDir(cleanUsername);

    // Sign JWT and set cookie
    const token = await signJWT({ username: cleanUsername });

    const response = NextResponse.json({ success: true, username: cleanUsername });
    
    // Set secure cookie
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
