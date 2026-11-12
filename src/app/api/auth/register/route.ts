import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { SESSION_COOKIE, signSession, sessionCookieOptions } from '@/lib/session';

// Student self-registration: users + students rows are inserted in ONE transaction,
// so a bad SRN never leaves a half-created account behind.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const fullName = String(b.full_name ?? '').trim();
  const srn = String(b.srn ?? '').trim().toUpperCase();
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const semester = Number(b.semester);
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  try {
    const hash = await bcrypt.hash(password, 10);
    const userId = await withTransaction(null, async (c) => {
      const { rows: [u] } = await c.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'student') RETURNING user_id`,
        [email, hash, fullName]);
      await c.query(`INSERT INTO students (student_id, srn, semester) VALUES ($1, $2, $3)`, [u.user_id, srn, semester]);
      return u.user_id as number;
    });
    const token = await signSession({ userId, role: 'student', name: fullName });
    const res = NextResponse.json({ redirect: '/student' });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 400 });
  }
}
