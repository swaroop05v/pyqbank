import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { query, dbErrorMessage } from '@/lib/db';

// Save a question to the student's practice list (trg_bookmark_check allows only published papers)
export async function POST(req: Request) {
  try {
    const s = await requireApi('student');
    const { question_id, note } = await req.json();
    await query(`INSERT INTO bookmarks (student_id, question_id, note) VALUES ($1, $2, NULLIF(trim($3), ''))`,
      [s.userId, Number(question_id), typeof note === 'string' ? note.slice(0, 200) : '']);
    return NextResponse.json({ message: 'Saved' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireApi('student');
    const { question_id } = await req.json();
    await query(`DELETE FROM bookmarks WHERE student_id = $1 AND question_id = $2`, [s.userId, Number(question_id)]);
    return NextResponse.json({ message: 'Removed' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
