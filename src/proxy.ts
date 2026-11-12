import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession, homeFor, type Role } from '@/lib/session';

// Role-based route protection. Every API route ALSO re-checks the role itself (requireApi).
const ANY: Role[] = ['admin', 'faculty', 'student'];
const guarded: [prefix: string, roles: Role[]][] = [
  ['/admin', ['admin']],
  ['/faculty', ['faculty']],
  ['/student', ['student']],
  ['/bank', ANY],
  ['/api/admin', ['admin']],
  ['/api/faculty', ['faculty', 'admin']],
  ['/api/student', ['student']],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    if (session) return NextResponse.redirect(new URL(homeFor(session.role), req.url));
    return pathname === '/' ? NextResponse.redirect(new URL('/login', req.url)) : NextResponse.next();
  }

  const rule = guarded.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  if (rule && (!session || !rule[1].includes(session.role))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: session ? 'Forbidden' : 'Not logged in' }, { status: session ? 403 : 401 });
    }
    return NextResponse.redirect(new URL(session ? homeFor(session.role) : '/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/admin/:path*', '/faculty/:path*', '/student/:path*', '/bank/:path*', '/api/:path*'],
};
