import { NextResponse } from 'next/server';
import { getUserByUsername, createUser } from '@/lib/db';
import { hashPassword, signJWT } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if user exists
    const existingUser = getUserByUsername(cleanUsername);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    // Hash password & create user
    const passwordHash = await hashPassword(password);
    createUser(cleanUsername, passwordHash);

    // Create user's notes directory
    const userNotesDir = path.join('/mnt/mcnatt-storage/notes/users', cleanUsername);
    if (!fs.existsSync(userNotesDir)) {
      fs.mkdirSync(userNotesDir, { recursive: true });
    }

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
