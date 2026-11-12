import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// sp_publish_paper checks permission, that the paper has questions and that all are embedded
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('faculty', 'admin');
    const paperId = Number((await params).id);
    await withTransaction(s.userId, (c) => c.query(`CALL sp_publish_paper($1, $2)`, [paperId, s.userId]));
    return NextResponse.json({ redirect: `/bank/paper/${paperId}` });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
