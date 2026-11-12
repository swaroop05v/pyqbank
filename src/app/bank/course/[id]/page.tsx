import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { Badge, Bar, Empty, PageHeader } from '@/components/ui';

type Params = Promise<{ id: string }>;
type SP = Promise<{ tab?: string; unit?: string }>;

const tabs = [['hot', 'Most repeated'], ['units', 'Unit weightage'], ['topics', 'Topics'], ['papers', 'Past papers']];

export default async function CoursePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { id } = await params;
  const { tab = 'hot', unit } = await searchParams;
  const courseId = Number(id);
  if (!Number.isInteger(courseId)) notFound();
  const course = await queryOne<{ code: string; name: string; semester: number }>(
    `SELECT code, name, semester FROM courses WHERE course_id = $1`, [courseId]);
  if (!course) notFound();
  const units = await query<{ unit_no: number; title: string }>(
    `SELECT unit_no, title FROM units WHERE course_id = $1 ORDER BY unit_no`, [courseId]);

  return (
    <>
      <PageHeader title={course.name} subtitle={<span className="font-mono">{course.code} · Semester {course.semester}</span>}>
        <Link href={`/bank/search?course=${courseId}`} className="btn-secondary">Search this course</Link>
      </PageHeader>
      <nav className="flex flex-wrap gap-1 border-b border-stone-200">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/bank/course/${courseId}?tab=${key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === key ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-stone-600 hover:text-stone-900'}`}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'hot' && <Hot courseId={courseId} unit={unit ? Number(unit) : null} units={units} />}
      {tab === 'units' && <Units courseId={courseId} />}
      {tab === 'topics' && <Topics courseId={courseId} />}
      {tab === 'papers' && <Papers courseId={courseId} />}
    </>
  );
}

async function Hot({ courseId, unit, units }: { courseId: number; unit: number | null; units: { unit_no: number; title: string }[] }) {
  const rows = await query<{ group_id: number; hot_rank: number; heat_score: number; label: string; unit_no: number; topic: string;
    appearances: number; distinct_years: number; asked_in: string; avg_marks: string; years_since_last: number }>(
    `SELECT group_id, hot_rank, heat_score, label, unit_no, topic, appearances, distinct_years, asked_in, avg_marks, years_since_last
     FROM v_hot_questions
     WHERE course_id = $1 AND ($2::int IS NULL OR unit_no = $2)
     ORDER BY hot_rank, last_year DESC
     LIMIT 30`, [courseId, unit]);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted">Unit:</span>
        <Link href={`/bank/course/${courseId}?tab=hot`} className={`rounded-full px-3 py-1 ${unit === null ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-stone-200'}`}>All</Link>
        {units.map((u) => (
          <Link key={u.unit_no} href={`/bank/course/${courseId}?tab=hot&unit=${u.unit_no}`} title={u.title}
            className={`rounded-full px-3 py-1 ${unit === u.unit_no ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-stone-200'}`}>
            Unit {u.unit_no}
          </Link>
        ))}
      </div>
      <p className="muted">
        Each row is one question that was asked more than once, possibly in different words. Ranked by how many different
        years it appeared in, with a bonus if it appeared in the last two years.
      </p>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <Empty>No repeated questions yet.</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>Question (first wording)</th><th>Unit</th><th>Asked</th><th>Where</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.group_id}>
                  <td className="font-semibold tabular-nums">{r.hot_rank}</td>
                  <td className="max-w-xl">
                    <Link href={`/bank/group/${r.group_id}`} className="qtext hover:text-brand-700">{r.label}</Link>
                    <div className="muted mt-1 text-xs">{r.topic} · avg {Number(r.avg_marks)} marks</div>
                  </td>
                  <td>{r.unit_no}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-semibold">{r.appearances}×</span>
                    <span className="muted text-xs"> in {r.distinct_years} yr</span>
                  </td>
                  <td className="text-xs text-stone-600">{r.asked_in}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

async function Units({ courseId }: { courseId: number }) {
  const rows = await query<{ unit_no: number; title: string; questions: number; total_marks: string; pct_marks: string; papers: number }>(
    `SELECT unit_no, title, questions, total_marks, pct_marks, papers FROM v_unit_weightage WHERE course_id = $1 ORDER BY unit_no`, [courseId]);
  const byType = await query<{ unit_no: number; exam_type: string; marks: string }>(
    `SELECT u.unit_no, p.exam_type, SUM(q.marks) AS marks
     FROM questions q
     JOIN exam_papers p ON p.paper_id = q.paper_id AND p.status = 'published'
     JOIN topics t ON t.topic_id = q.topic_id
     JOIN units u ON u.unit_id = t.unit_id
     WHERE p.course_id = $1
     GROUP BY u.unit_no, p.exam_type
     ORDER BY u.unit_no, p.exam_type`, [courseId]);
  return (
    <section className="card space-y-4">
      <p className="muted">Share of all marks asked from each unit across every published paper.</p>
      {rows.map((r) => (
        <div key={r.unit_no}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span><span className="font-semibold">Unit {r.unit_no}</span> · {r.title}</span>
            <span className="muted text-xs">
              {r.questions} questions · {Number(r.total_marks)} marks ·{' '}
              {byType.filter((b) => b.unit_no === r.unit_no).map((b) => `${b.exam_type} ${Number(b.marks)}`).join(', ')}
            </span>
          </div>
          <Bar pct={r.pct_marks} />
        </div>
      ))}
    </section>
  );
}

async function Topics({ courseId }: { courseId: number }) {
  const rows = await query<{ topic_id: number; unit_no: number; topic: string; times_asked: number; years_asked: number;
    last_asked: number | null; total_marks: string; repeated_questions: number }>(
    `SELECT topic_id, unit_no, topic, times_asked, years_asked, last_asked, total_marks, repeated_questions
     FROM v_topic_frequency WHERE course_id = $1 ORDER BY times_asked DESC, unit_no, topic`, [courseId]);
  return (
    <section className="card overflow-x-auto p-0">
      <table className="table">
        <thead><tr><th>Topic</th><th>Unit</th><th>Times asked</th><th>Years</th><th>Last asked</th><th>Marks</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.topic_id}>
              <td>{r.topic}</td>
              <td>{r.unit_no}</td>
              <td className="tabular-nums font-semibold">{r.times_asked}</td>
              <td className="tabular-nums">{r.years_asked}</td>
              <td>{r.last_asked ?? '-'}</td>
              <td className="tabular-nums">{Number(r.total_marks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Papers({ courseId }: { courseId: number }) {
  const rows = await query<{ paper_id: number; exam_type: string; exam_year: number; questions: number; max_marks: number;
    marks_listed: string; repeated_questions: number; repeated_marks: string }>(
    `SELECT paper_id, exam_type, exam_year, questions, max_marks, marks_listed, repeated_questions, repeated_marks
     FROM v_paper_summary WHERE course_id = $1 AND status = 'published'
     ORDER BY exam_year DESC, exam_type DESC`, [courseId]);
  return (
    <section className="card overflow-x-auto p-0">
      {rows.length === 0 ? <Empty>No published papers.</Empty> : (
        <table className="table">
          <thead><tr><th>Paper</th><th>Questions</th><th>Max marks</th><th>Repeated from earlier papers</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const pct = Number(r.marks_listed) ? (100 * Number(r.repeated_marks)) / Number(r.marks_listed) : 0;
              return (
                <tr key={r.paper_id}>
                  <td><Link className="link font-medium" href={`/bank/paper/${r.paper_id}`}>{r.exam_type} {r.exam_year}</Link> <Badge value={r.exam_type} /></td>
                  <td className="tabular-nums">{r.questions}</td>
                  <td className="tabular-nums">{r.max_marks}</td>
                  <td className="min-w-56">
                    <Bar pct={pct} />
                    <div className="muted text-xs">{r.repeated_questions} questions, {Number(r.repeated_marks)} of {Number(r.marks_listed)} marks</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
