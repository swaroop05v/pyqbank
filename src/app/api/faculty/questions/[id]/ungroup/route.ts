import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// "Not a repeat": sp_ungroup_question removes it and remembers the decision
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('faculty', 'admin');
    const questionId = Number((await params).id);
    await withTransaction(s.userId, (c) => c.query(`CALL sp_ungroup_question($1, $2)`, [questionId, s.userId]));
    return NextResponse.json({ message: 'Removed from group' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
