import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ActionButton } from '@/components/client';
import { Empty, PageHeader, RepeatChip, Stat } from '@/components/ui';

export default async function StudentHome() {
  const s = await requirePage('student');
  const me = await queryOne<{ srn: string; semester: number }>(`SELECT srn, semester FROM students WHERE student_id = $1`, [s.userId]);

  // top repeated questions of the courses in the student's semester (all courses if none match)
  const hot = await query<{ group_id: number; course_code: string; label: string; appearances: number; asked_in: string; hot_rank: number }>(
    `SELECT h.group_id, h.course_code, h.label, h.appearances, h.asked_in, h.hot_rank
     FROM v_hot_questions h JOIN courses c ON c.course_id = h.course_id
     WHERE c.semester = $1 OR NOT EXISTS (SELECT 1 FROM courses WHERE semester = $1)
     ORDER BY h.hot_rank, h.appearances DESC
     LIMIT 8`, [me?.semester ?? 0]);

  const saved = await query<{ question_id: number; paper_id: number; course_code: string; exam_type: string; exam_year: number;
    q_label: string; body: string; marks: string; group_id: number | null; group_size: number | null; note: string | null }>(
    `SELECT d.question_id, d.paper_id, d.course_code, d.exam_type, d.exam_year, d.q_label, d.body, d.marks,
            d.group_id, d.group_size, b.note
     FROM bookmarks b JOIN v_question_detail d ON d.question_id = b.question_id
     WHERE b.student_id = $1
     ORDER BY b.created_at DESC`, [s.userId]);

  const counts = await queryOne<{ courses: number; papers: number; groups: number }>(
    `SELECT (SELECT COUNT(*) FROM courses)::int AS courses,
            (SELECT COUNT(*) FROM exam_papers WHERE status = 'published')::int AS papers,
            (SELECT COUNT(*) FROM v_repeat_groups)::int AS groups`);

  return (
    <>
      <PageHeader title={`Hi, ${s.name.split(' ')[0]}`} subtitle={me ? `${me.srn} · Semester ${me.semester}` : undefined}>
        <Link href="/bank/search" className="btn-primary">Search questions</Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Courses" value={counts?.courses} />
        <Stat label="Past papers" value={counts?.papers} />
        <Stat label="Repeated questions found" value={counts?.groups} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="h2">Most repeated in your semester</h2>
            <Link href="/bank" className="link text-sm">All courses</Link>
          </div>
          {hot.length === 0 ? <Empty>No repeats yet.</Empty> : (
            <ol className="space-y-3">
              {hot.map((h) => (
                <li key={h.group_id} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-900">{h.hot_rank}</span>
                  <div>
                    <Link href={`/bank/group/${h.group_id}`} className="qtext text-sm hover:text-brand-700">{h.label}</Link>
                    <div className="muted text-xs">{h.course_code} · asked {h.appearances}× · {h.asked_in}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card space-y-3">
          <h2 className="h2">My saved questions ({saved.length})</h2>
          {saved.length === 0 ? <Empty>Save questions from any paper to build a practice list.</Empty> : saved.map((q) => (
            <div key={q.question_id} className="border-b border-stone-100 pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/bank/paper/${q.paper_id}`} className="link font-semibold">{q.course_code} · {q.exam_type} {q.exam_year} · Q{q.q_label}</Link>
                <div className="flex items-center gap-2">
                  <RepeatChip groupId={q.group_id} size={q.group_size} />
                  <ActionButton url="/api/student/bookmarks" method="DELETE" body={{ question_id: q.question_id }} label="Remove" className="btn-ghost btn-sm" />
                </div>
              </div>
              <p className="qtext mt-1 text-sm">{q.body}</p>
              {q.note && <p className="mt-1 text-xs italic text-stone-500">Note: {q.note}</p>}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
