import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');
    const b = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `INSERT INTO courses (code, name, semester, credits) VALUES (upper(trim($1)), trim($2), $3, $4)`,
      [String(b.code ?? ''), String(b.name ?? ''), Number(b.semester), Number(b.credits ?? 4)]));
    return NextResponse.json({ message: 'Course added' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
