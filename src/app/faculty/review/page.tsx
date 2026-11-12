import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { query } from '@/lib/db';
import { ActionButton } from '@/components/client';
import { Empty, PageHeader, Similarity } from '@/components/ui';

type Pair = { q_low: number; q_high: number; similarity: string; course_code: string;
  a_body: string; a_paper: string; a_paper_id: number; a_topic: string;
  b_body: string; b_paper: string; b_paper_id: number; b_topic: string };

export default async function ReviewQueue() {
  const s = await requirePage('faculty');
  const pairs = await query<Pair>(
    `SELECT rc.q_low, rc.q_high, rc.similarity, a.course_code,
            a.body AS a_body, a.exam_type || ' ' || a.exam_year || ' Q' || a.q_label AS a_paper, a.paper_id AS a_paper_id, a.topic AS a_topic,
            b.body AS b_body, b.exam_type || ' ' || b.exam_year || ' Q' || b.q_label AS b_paper, b.paper_id AS b_paper_id, b.topic AS b_topic
     FROM repeat_candidates rc
     JOIN v_question_detail a ON a.question_id = rc.q_low
     JOIN v_question_detail b ON b.question_id = rc.q_high
     WHERE rc.status = 'pending'
       AND a.course_id IN (SELECT course_id FROM faculty_courses WHERE faculty_id = $1)
     ORDER BY rc.similarity DESC
     LIMIT 50`, [s.userId]);

  return (
    <>
      <PageHeader title="Review queue"
        subtitle="The detector was unsure about these pairs (similarity between the review and auto-group thresholds). Decide whether each pair is the same question." />
      {pairs.length === 0 ? <div className="card"><Empty>Nothing to review. 🎉</Empty></div> : pairs.map((p) => (
        <div key={`${p.q_low}-${p.q_high}`} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-sm"><span className="font-mono text-xs text-stone-500">{p.course_code}</span><Similarity value={p.similarity} /></div>
            <div className="flex gap-2">
              <ActionButton url="/api/faculty/review" body={{ q_low: p.q_low, q_high: p.q_high, decision: 'confirmed' }} label="Same question" />
              <ActionButton url="/api/faculty/review" body={{ q_low: p.q_low, q_high: p.q_high, decision: 'rejected' }} label="Different" className="btn-secondary btn-sm" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[[p.a_paper, p.a_paper_id, p.a_body, p.a_topic], [p.b_paper, p.b_paper_id, p.b_body, p.b_topic]].map(([paper, pid, body, topic]) => (
              <div key={String(paper)} className="rounded-lg bg-stone-50 p-3">
                <Link href={`/bank/paper/${pid}`} className="link text-xs font-semibold">{paper}</Link>
                <p className="qtext mt-1 text-sm">{body}</p>
                <p className="muted mt-1 text-xs">{topic}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
