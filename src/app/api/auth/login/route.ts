import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/lib/db';
import { SESSION_COOKIE, signSession, sessionCookieOptions, homeFor, type Role } from '@/lib/session';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await queryOne<{ user_id: number; password_hash: string; full_name: string; role: Role; is_active: boolean }>(
    `SELECT user_id, password_hash, full_name, role, is_active FROM users WHERE email = lower($1)`,
    [email.trim()],
  );

  // same message for unknown email and wrong password (no account enumeration)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!user.is_active) return NextResponse.json({ error: 'Account is disabled' }, { status: 403 });

  const token = await signSession({ userId: user.user_id, role: user.role, name: user.full_name });
  const res = NextResponse.json({ redirect: homeFor(user.role) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
