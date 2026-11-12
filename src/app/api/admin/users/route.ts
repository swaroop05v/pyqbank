import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Create a faculty account
export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');
    const b = await req.json();
    const password = String(b.password ?? '');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const hash = await bcrypt.hash(password, 10);
    await withTransaction(s.userId, (c) => c.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES (lower(trim($1)), $2, trim($3), 'faculty')`,
      [String(b.email ?? ''), hash, String(b.full_name ?? '')]));
    return NextResponse.json({ message: 'Faculty account created' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
