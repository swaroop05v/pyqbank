import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Confirm or reject a suggested pair. sp_review_candidate locks the row (FOR UPDATE),
// checks the reviewer is assigned to the course, and links the questions if confirmed.
export async function POST(req: Request) {
  try {
    const s = await requireApi('faculty', 'admin');
    const { q_low, q_high, decision } = await req.json();
    if (decision !== 'confirmed' && decision !== 'rejected') throw new HttpError(400, 'Decision must be confirmed or rejected');
    await withTransaction(s.userId, (c) =>
      c.query(`CALL sp_review_candidate($1, $2, $3, $4)`, [Number(q_low), Number(q_high), decision, s.userId]));
    return NextResponse.json({ message: decision === 'confirmed' ? 'Linked' : 'Marked as different' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
