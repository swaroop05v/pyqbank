import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { assertCanManageCourse } from '@/lib/guards';

// Create a draft exam paper
export async function POST(req: Request) {
  try {
    const s = await requireApi('faculty', 'admin');
    const b = await req.json();
    const courseId = Number(b.course_id);
    await assertCanManageCourse(s.userId, courseId);
    const paperId = await withTransaction(s.userId, async (c) => {
      const { rows: [p] } = await c.query(
        `INSERT INTO exam_papers (course_id, exam_type, exam_year, max_marks, duration_min, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING paper_id`,
        [courseId, b.exam_type, Number(b.exam_year), Number(b.max_marks), Number(b.duration_min ?? 90), s.userId]);
      return p.paper_id as number;
    });
    return NextResponse.json({ redirect: `/faculty/papers/${paperId}` });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
