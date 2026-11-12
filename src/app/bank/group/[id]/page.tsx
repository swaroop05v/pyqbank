import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ActionButton } from '@/components/client';
import { Badge, PageHeader, Similarity } from '@/components/ui';

type Params = Promise<{ id: string }>;

export default async function GroupPage({ params }: { params: Params }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();
  const session = (await getSession())!;

  const g = await queryOne<{ group_id: number; course_id: number; code: string; name: string; label: string; created_by: string | null;
    hot_rank: number | null; can_manage: boolean }>(
    `SELECT g.group_id, g.course_id, c.code, c.name, g.label, u.full_name AS created_by, h.hot_rank,
            fn_can_manage_course($2, g.course_id) AS can_manage
     FROM repeat_groups g
     JOIN courses c ON c.course_id = g.course_id
     LEFT JOIN users u ON u.user_id = g.created_by
     LEFT JOIN v_hot_questions h ON h.group_id = g.group_id
     WHERE g.group_id = $1`, [groupId, session.userId]);
  if (!g) notFound();

  // every wording of this question, with its similarity to the first appearance
  const members = await query<{ question_id: number; paper_id: number; exam_type: string; exam_year: number; q_label: string;
    marks: string; body: string; topic: string; paper_status: string; sim_to_first: string | null }>(
    `WITH m AS (
        SELECT d.*, ROW_NUMBER() OVER (ORDER BY d.exam_year, d.exam_type, d.question_id) AS n
        FROM v_question_detail d WHERE d.group_id = $1
     )
     SELECT m.question_id, m.paper_id, m.exam_type, m.exam_year, m.q_label, m.marks, m.body, m.topic, m.paper_status,
            fn_similarity(m.question_id, (SELECT question_id FROM m WHERE n = 1)) AS sim_to_first
     FROM m
     WHERE m.paper_status = 'published' OR $2
     ORDER BY m.n`, [groupId, session.role !== 'student']);

  return (
    <>
      <PageHeader title="Repeated question" subtitle={<span><Link className="link font-mono" href={`/bank/course/${g.course_id}`}>{g.code}</Link> · {g.name}</span>}>
        {g.hot_rank && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">#{g.hot_rank} most likely in {g.code}</span>}
      </PageHeader>
      <div className="card">
        <div className="label">Asked {members.length} times</div>
        <p className="qtext text-lg">{g.label}</p>
        <p className="muted mt-2 text-xs">
          Grouped {g.created_by ? `by ${g.created_by}` : 'automatically by the repeat detector'}. Different wordings of the same question are listed below
          with their cosine similarity to the first appearance.
        </p>
      </div>
      <div className="space-y-3">
        {members.map((m, i) => (
          <div key={m.question_id} className="card flex flex-wrap items-start gap-4">
            <div className="w-28 shrink-0">
              <Link href={`/bank/paper/${m.paper_id}`} className="link font-semibold">{m.exam_type} {m.exam_year}</Link>
              <div className="muted text-xs">Q{m.q_label} · {Number(m.marks)} marks</div>
              {m.paper_status !== 'published' && <Badge value={m.paper_status} className="mt-1" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="qtext">{m.body}</p>
              <p className="muted mt-1 text-xs">{m.topic}</p>
            </div>
            <div className="flex w-36 shrink-0 flex-col items-end gap-2">
              {i === 0 ? <span className="muted text-xs">first appearance</span> : <Similarity value={m.sim_to_first} />}
              {g.can_manage && (
                <ActionButton url={`/api/faculty/questions/${m.question_id}/ungroup`} label="Not a repeat"
                  className="btn-secondary btn-sm" confirm="Remove this question from the group? The detector will remember this decision." />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
