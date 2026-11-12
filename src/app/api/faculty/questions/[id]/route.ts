import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { queryOne, withTransaction, dbErrorMessage } from '@/lib/db';
import { assertCanManageCourse } from '@/lib/guards';

type Ctx = { params: Promise<{ id: string }> };

// Delete a question of a draft paper (trg_question_delete_guard blocks published papers)
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('faculty', 'admin');
    const questionId = Number((await params).id);
    const q = await queryOne<{ course: number | null }>(`SELECT fn_question_course($1) AS course`, [questionId]);
    if (!q?.course) throw new HttpError(404, 'Question not found');
    await assertCanManageCourse(s.userId, q.course);
    await withTransaction(s.userId, (c) => c.query(`DELETE FROM questions WHERE question_id = $1`, [questionId]));
    return NextResponse.json({ message: 'Deleted' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
