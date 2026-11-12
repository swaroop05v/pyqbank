import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');
    const b = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `INSERT INTO units (course_id, unit_no, title) VALUES ($1, $2, trim($3))`,
      [Number(b.course_id), Number(b.unit_no), String(b.title ?? '')]));
    return NextResponse.json({ message: 'Unit added' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
