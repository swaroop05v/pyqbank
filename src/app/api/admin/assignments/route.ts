import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Assign a faculty member to a course (trg_faculty_role_check rejects non-faculty users)
export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');
    const { faculty_id, course_id } = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `INSERT INTO faculty_courses (faculty_id, course_id) VALUES ($1, $2)`, [Number(faculty_id), Number(course_id)]));
    return NextResponse.json({ message: 'Assigned' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireApi('admin');
    const { faculty_id, course_id } = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `DELETE FROM faculty_courses WHERE faculty_id = $1 AND course_id = $2`, [Number(faculty_id), Number(course_id)]));
    return NextResponse.json({ message: 'Unassigned' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
