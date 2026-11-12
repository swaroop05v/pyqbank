import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');
    const b = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `INSERT INTO topics (unit_id, name) VALUES ($1, trim($2))`, [Number(b.unit_id), String(b.name ?? '')]));
    return NextResponse.json({ message: 'Topic added' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
