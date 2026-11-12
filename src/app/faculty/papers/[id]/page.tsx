import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ActionButton, ApiForm } from '@/components/client';
import { Badge, Empty, PageHeader, RepeatChip, Similarity } from '@/components/ui';

type Params = Promise<{ id: string }>;

export default async function PaperEditor({ params }: { params: Params }) {
  const s = await requirePage('faculty');
  const { id } = await params;
  const paperId = Number(id);
  if (!Number.isInteger(paperId)) notFound();

  const paper = await queryOne<{ paper_id: number; course_id: number; code: string; name: string; exam_type: string; exam_year: number;
    max_marks: number; status: string; can_manage: boolean }>(
    `SELECT p.paper_id, p.course_id, c.code, c.name, p.exam_type, p.exam_year, p.max_marks, p.status,
            fn_can_manage_course($2, p.course_id) AS can_manage
     FROM exam_papers p JOIN courses c ON c.course_id = p.course_id WHERE p.paper_id = $1`, [paperId, s.userId]);
  if (!paper || !paper.can_manage) notFound();
  if (paper.status === 'published') redirect(`/bank/paper/${paperId}`);

  const topics = await query<{ topic_id: number; unit_no: number; name: string }>(
    `SELECT t.topic_id, u.unit_no, t.name FROM topics t JOIN units u ON u.unit_id = t.unit_id
     WHERE u.course_id = $1 ORDER BY u.unit_no, t.name`, [paper.course_id]);

  // each question with its group and its strongest pending suggestion
  const questions = await query<{ question_id: number; q_label: string; marks: string; body: string; unit_no: number; topic: string;
    group_id: number | null; group_size: number | null; has_embedding: boolean;
    best_sim: string | null; best_body: string | null; best_paper: string | null; suggestions: number }>(
    `SELECT d.question_id, d.q_label, d.marks, d.body, d.unit_no, d.topic, d.group_id, d.group_size, d.has_embedding,
            s.similarity AS best_sim, s.body AS best_body, s.paper AS best_paper, COALESCE(s.n, 0)::int AS suggestions
     FROM v_question_detail d
     LEFT JOIN LATERAL (
         SELECT rc.similarity, o.body, o.exam_type || ' ' || o.exam_year AS paper,
                COUNT(*) OVER () AS n
         FROM repeat_candidates rc
         JOIN v_question_detail o ON o.question_id = CASE WHEN rc.q_low = d.question_id THEN rc.q_high ELSE rc.q_low END
         WHERE rc.status = 'pending' AND d.question_id IN (rc.q_low, rc.q_high)
         ORDER BY rc.similarity DESC
         LIMIT 1
     ) s ON TRUE
     WHERE d.paper_id = $1
     ORDER BY length(d.q_label), d.q_label`, [paperId]);

  const total = questions.reduce((n, q) => n + Number(q.marks), 0);

  return (
    <>
      <PageHeader title={`${paper.code} · ${paper.exam_type} ${paper.exam_year}`} subtitle={`${paper.name} · ${questions.length} questions · ${total} of ${paper.max_marks} marks listed`}>
        <div className="flex flex-wrap items-start gap-2">
          <Badge value={paper.status} />
          <ActionButton url={`/api/faculty/papers/${paperId}/publish`} label="Publish paper" className="btn-primary"
            confirm="Publish this paper? After publishing, its questions are locked." />
          <ActionButton url={`/api/faculty/papers/${paperId}`} method="DELETE" label="Delete draft" className="btn-secondary"
            confirm="Delete this draft and all its questions?" redirectTo="/faculty" />
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-1">Add a question</h2>
          <p className="muted mb-4 text-xs">When you add a question, its embedding is computed and the database trigger compares it with every earlier paper of this course.</p>
          <ApiForm url={`/api/faculty/papers/${paperId}/questions`} submitLabel="Add and check for repeats" resetOnSuccess>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="q_label">Question no.</label>
                <input className="input" id="q_label" name="q_label" placeholder="1a" required />
              </div>
              <div>
                <label className="label" htmlFor="marks">Marks</label>
                <input className="input" id="marks" name="marks" type="number" step="0.5" defaultValue={5} data-number required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="topic_id">Topic</label>
              <select className="input" id="topic_id" name="topic_id" data-number required>
                {topics.map((t) => <option key={t.topic_id} value={t.topic_id}>Unit {t.unit_no}: {t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="body">Question text</label>
              <textarea className="input min-h-28" id="body" name="body" required />
            </div>
          </ApiForm>
        </section>

        <section className="space-y-3 lg:col-span-3">
          {questions.length === 0 ? <div className="card"><Empty>No questions yet.</Empty></div> : questions.map((q) => (
            <div key={q.question_id} className="card space-y-2 p-4">
              <div className="flex items-start gap-3">
                <span className="font-mono font-semibold">{q.q_label}</span>
                <div className="min-w-0 flex-1">
                  <p className="qtext">{q.body}</p>
                  <p className="muted mt-1 text-xs">Unit {q.unit_no} · {q.topic} · {Number(q.marks)} marks</p>
                </div>
                <ActionButton url={`/api/faculty/questions/${q.question_id}`} method="DELETE" label="Delete" className="btn-ghost btn-sm" />
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-xs">
                {q.group_id ? (
                  <><RepeatChip groupId={q.group_id} size={q.group_size} /><span className="text-stone-600">Grouped automatically with earlier appearances.</span></>
                ) : q.suggestions > 0 ? (
                  <>
                    <span className="font-semibold text-amber-800">{q.suggestions} possible repeat(s) sent for review</span>
                    <Similarity value={q.best_sim} />
                    <span className="text-stone-600">closest: {q.best_paper}: “{q.best_body?.slice(0, 90)}…”</span>
                  </>
                ) : (
                  <span className="text-stone-600">{q.has_embedding ? 'New question: nothing similar in earlier papers.' : 'No embedding yet.'}</span>
                )}
              </div>
            </div>
          ))}
          {questions.some((q) => q.suggestions > 0) && (
            <Link href="/faculty/review" className="link text-sm">Open the review queue →</Link>
          )}
        </section>
      </div>
    </>
  );
}
