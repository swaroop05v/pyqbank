import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { embedText } from '@/lib/embeddings';
import { assertCanManageCourse, paperCourse } from '@/lib/guards';

type Ctx = { params: Promise<{ id: string }> };

// Add a question to a draft paper. The embedding is computed here, and inserting the row
// fires trg_detect_repeats, which groups it or queues suggestions inside the same transaction.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('faculty', 'admin');
    const paperId = Number((await params).id);
    const p = await paperCourse(paperId);
    await assertCanManageCourse(s.userId, p.course_id);

    const b = await req.json();
    const body = String(b.body ?? '').trim().replace(/\s+/g, ' ');
    const label = String(b.q_label ?? '').trim().toLowerCase();
    if (body.length < 10) throw new HttpError(400, 'Question text must be at least 10 characters');
    const vector = await embedText(body);

    const result = await withTransaction(s.userId, async (c) => {
      const { rows: [q] } = await c.query(
        `INSERT INTO questions (paper_id, q_label, topic_id, marks, body, embedding)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING question_id`,
        [paperId, label, Number(b.topic_id), Number(b.marks), body, vector]);
      const { rows: [r] } = await c.query(
        `SELECT q.group_id,
                (SELECT COUNT(*) FROM questions WHERE group_id = q.group_id)::int AS group_size,
                (SELECT COUNT(*) FROM repeat_candidates WHERE status = 'pending' AND $1 IN (q_low, q_high))::int AS suggestions
         FROM questions q WHERE q.question_id = $1`, [q.question_id]);
      return r as { group_id: number | null; group_size: number; suggestions: number };
    });

    const message = result.group_id
      ? `Q${label} added. Repeat detected: grouped with ${result.group_size - 1} earlier appearance(s).`
      : result.suggestions > 0
        ? `Q${label} added. ${result.suggestions} possible repeat(s) sent to the review queue.`
        : `Q${label} added. No similar question in earlier papers.`;
    return NextResponse.json({ message });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
