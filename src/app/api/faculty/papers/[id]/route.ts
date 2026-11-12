import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { assertCanManageCourse, paperCourse } from '@/lib/guards';

type Ctx = { params: Promise<{ id: string }> };

// Delete a DRAFT paper (its questions are removed by ON DELETE CASCADE)
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('faculty', 'admin');
    const paperId = Number((await params).id);
    const p = await paperCourse(paperId);
    await assertCanManageCourse(s.userId, p.course_id);
    if (p.status !== 'draft') throw new HttpError(400, 'Only draft papers can be deleted');
    await withTransaction(s.userId, (c) => c.query(`DELETE FROM exam_papers WHERE paper_id = $1 AND status = 'draft'`, [paperId]));
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
