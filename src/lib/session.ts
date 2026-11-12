// Edge-safe JWT helpers (used by both proxy.ts and server code)
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'faculty' | 'student';
export type Session = { userId: number; role: Role; name: string };

export const SESSION_COOKIE = 'pyq_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours
const ROLES: Role[] = ['admin', 'faculty', 'student'];

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET must be set (16+ chars) in .env');
  return new TextEncoder().encode(s);
}

/** Creates a signed token holding the user's id, role and name. */
export async function signSession(session: Session) {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

/** Returns the session if the token is genuine and not expired, otherwise null. */
export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { userId, role, name } = payload;
    if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) return null;
    if (typeof role !== 'string' || !ROLES.includes(role as Role)) return null;
    if (typeof name !== 'string' || name.length === 0) return null;
    return { userId, role: role as Role, name };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,                                   // JavaScript in the page cannot read it
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};

export const homeFor = (role: Role) => `/${role}`;
