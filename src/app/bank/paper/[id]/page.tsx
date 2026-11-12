import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ActionButton } from '@/components/client';
import { Badge, PageHeader, RepeatChip } from '@/components/ui';

type Params = Promise<{ id: string }>;
type Q = { question_id: number; q_label: string; marks: string; body: string; group_id: number | null; group_size: number | null;
  unit_no: number; topic: string; earlier: string | null; bookmarked: boolean };

export default async function PaperPage({ params }: { params: Params }) {
  const { id } = await params;
  const paperId = Number(id);
  if (!Number.isInteger(paperId)) notFound();
  const session = (await getSession())!;

  const paper = await queryOne<{ paper_id: number; course_id: number; code: string; name: string; exam_type: string; exam_year: number;
    max_marks: number; duration_min: number; status: string; repeated_marks: string; marks_listed: string }>(
    `SELECT p.paper_id, p.course_id, c.code, c.name, p.exam_type, p.exam_year, p.max_marks, p.duration_min, p.status,
            s.repeated_marks, s.marks_listed
     FROM exam_papers p JOIN courses c ON c.course_id = p.course_id
     JOIN v_paper_summary s ON s.paper_id = p.paper_id
     WHERE p.paper_id = $1`, [paperId]);
  if (!paper || (paper.status !== 'published' && session.role === 'student')) notFound();

  // For every question: where its repeat group appeared BEFORE this paper (LATERAL subquery)
  const questions = await query<Q>(
    `SELECT d.question_id, d.q_label, d.marks, d.body, d.group_id, d.group_size, d.unit_no, d.topic,
            prev.earlier,
            EXISTS (SELECT 1 FROM bookmarks b WHERE b.question_id = d.question_id AND b.student_id = $2) AS bookmarked
     FROM v_question_detail d
     LEFT JOIN LATERAL (
         SELECT string_agg(p2.exam_type || ' ' || p2.exam_year, ', ' ORDER BY p2.exam_year, p2.exam_type) AS earlier
         FROM questions q2 JOIN exam_papers p2 ON p2.paper_id = q2.paper_id
         WHERE q2.group_id = d.group_id AND q2.question_id <> d.question_id AND p2.status = 'published'
           AND (p2.exam_year, p2.exam_type) < (d.exam_year, d.exam_type)
     ) prev ON TRUE
     WHERE d.paper_id = $1
     ORDER BY length(d.q_label), d.q_label`, [paperId, session.userId]);

  return (
    <>
      <PageHeader
        title={`${paper.name}: ${paper.exam_type} ${paper.exam_year}`}
        subtitle={<span><Link className="link font-mono" href={`/bank/course/${paper.course_id}?tab=papers`}>{paper.code}</Link> · Max marks {paper.max_marks} · {paper.duration_min} min</span>}>
        <div className="flex gap-2"><Badge value={paper.exam_type} /><Badge value={paper.status} /></div>
      </PageHeader>
      <div className="card text-sm">
        <span className="font-semibold text-amber-800">{Number(paper.repeated_marks)} of {Number(paper.marks_listed)} marks</span>{' '}
        in this paper came from questions asked in earlier papers.
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Q</th><th>Question</th><th>Marks</th><th>Repeat</th>{session.role === 'student' && <th></th>}</tr></thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.question_id} className={q.earlier ? 'bg-amber-50/40' : ''}>
                <td className="font-mono font-semibold">{q.q_label}</td>
                <td className="max-w-2xl">
                  <div className="qtext">{q.body}</div>
                  <div className="muted mt-1 text-xs">
                    Unit {q.unit_no} · {q.topic}
                    {q.earlier && <> · <span className="text-amber-800">asked before in {q.earlier}</span></>}
                  </div>
                </td>
                <td className="tabular-nums">{Number(q.marks)}</td>
                <td><RepeatChip groupId={q.group_id} size={q.group_size} /></td>
                {session.role === 'student' && (
                  <td>
                    {q.bookmarked
                      ? <ActionButton url="/api/student/bookmarks" method="DELETE" body={{ question_id: q.question_id }} label="★ Saved" className="btn-secondary btn-sm" />
                      : <ActionButton url="/api/student/bookmarks" body={{ question_id: q.question_id }} label="☆ Save" className="btn-ghost btn-sm" />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
