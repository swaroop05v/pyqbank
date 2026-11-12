import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// Refused by ON DELETE RESTRICT (exam_papers.course_id) while the course has papers
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('admin');
    const id = Number((await params).id);
    await withTransaction(s.userId, (c) => c.query(`DELETE FROM courses WHERE course_id = $1`, [id]));
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === '23001' || e.code === '23503') {
      return NextResponse.json({ error: 'This course still has exam papers (ON DELETE RESTRICT)' }, { status: 400 });
    }
    return jsonError(err, dbErrorMessage);
  }
}
