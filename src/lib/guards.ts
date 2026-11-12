import 'server-only';
import { queryOne } from './db';
import { HttpError } from './auth';

/** Throws 403 unless the user is an admin or a faculty member assigned to the course (fn_can_manage_course). */
export async function assertCanManageCourse(userId: number, courseId: number) {
  const r = await queryOne<{ ok: boolean }>(`SELECT fn_can_manage_course($1, $2) AS ok`, [userId, courseId]);
  if (!r?.ok) throw new HttpError(403, 'You are not assigned to this course');
}

/** Course of a paper, or 404. */
export async function paperCourse(paperId: number) {
  const r = await queryOne<{ course_id: number; status: string }>(`SELECT course_id, status FROM exam_papers WHERE paper_id = $1`, [paperId]);
  if (!r) throw new HttpError(404, 'Paper not found');
  return r;
}
