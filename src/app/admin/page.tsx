import Link from 'next/link';
import { query, queryOne } from '@/lib/db';
import { Badge, Bar, PageHeader, Stat, date } from '@/components/ui';

export default async function AdminHome() {
  const c = await queryOne<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'student')::int    AS students,
            (SELECT COUNT(*) FROM users WHERE role = 'faculty')::int    AS faculty,
            (SELECT COUNT(*) FROM courses)::int                         AS courses,
            (SELECT COUNT(*) FROM exam_papers WHERE status = 'published')::int AS published,
            (SELECT COUNT(*) FROM exam_papers WHERE status = 'draft')::int     AS drafts,
            (SELECT COUNT(*) FROM questions)::int                       AS questions,
            (SELECT COUNT(*) FROM repeat_groups)::int                   AS groups,
            (SELECT COUNT(*) FROM repeat_candidates WHERE status = 'pending')::int AS pending`);

  // repeat rate per course and year (GROUP BY over a view, then a window AVG for the course average)
  const trend = await query<{ course_code: string; exam_year: number; pct: string; course_avg: string }>(
    `SELECT course_code, exam_year,
            ROUND(100.0 * SUM(repeated_marks) / NULLIF(SUM(marks_listed), 0), 1) AS pct,
            ROUND(AVG(100.0 * SUM(repeated_marks) / NULLIF(SUM(marks_listed), 0)) OVER (PARTITION BY course_code), 1) AS course_avg
     FROM v_paper_summary WHERE status = 'published'
     GROUP BY course_code, exam_year
     ORDER BY course_code, exam_year`);

  const reviews = await query<{ code: string; pending: number; confirmed: number; rejected: number }>(
    `SELECT c.code,
            COUNT(*) FILTER (WHERE rc.status = 'pending')::int   AS pending,
            COUNT(*) FILTER (WHERE rc.status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE rc.status = 'rejected')::int  AS rejected
     FROM repeat_candidates rc JOIN courses c ON c.course_id = fn_question_course(rc.q_low)
     GROUP BY c.code ORDER BY c.code`);

  const recent = await query<{ log_id: number; table_name: string; operation: string; row_pk: string; actor: string | null; logged_at: string }>(
    `SELECT a.log_id, a.table_name, a.operation, a.row_pk, u.full_name AS actor, a.logged_at
     FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
     ORDER BY a.log_id DESC LIMIT 8`);

  return (
    <>
      <PageHeader title="Exam cell dashboard" subtitle="Everything below is computed live from views and aggregate queries." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published papers" value={c?.published} hint={`${c?.drafts} draft(s) in progress`} />
        <Stat label="Questions" value={c?.questions} hint={`${c?.courses} courses`} />
        <Stat label="Repeat groups" value={c?.groups} hint={`${c?.pending} pairs waiting for review`} />
        <Stat label="Users" value={(c?.students ?? 0) + (c?.faculty ?? 0) + 1} hint={`${c?.students} students · ${c?.faculty} faculty`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="h2">Share of marks repeated from earlier papers</h2>
          {[...new Set(trend.map((t) => t.course_code))].map((code) => (
            <div key={code} className="space-y-1">
              <div className="flex justify-between text-sm"><span className="font-mono font-semibold">{code}</span>
                <span className="muted text-xs">average {trend.find((t) => t.course_code === code)?.course_avg}%</span></div>
              {trend.filter((t) => t.course_code === code).map((t) => (
                <div key={t.exam_year} className="flex items-center gap-3 text-xs">
                  <span className="w-10 tabular-nums text-stone-500">{t.exam_year}</span>
                  <div className="flex-1"><Bar pct={t.pct} /></div>
                </div>
              ))}
            </div>
          ))}
        </section>
        <div className="space-y-6">
          <section className="card overflow-x-auto p-0">
            <div className="px-5 pt-4"><h2 className="h2">Detector suggestions</h2></div>
            <table className="table">
              <thead><tr><th>Course</th><th>Pending</th><th>Confirmed</th><th>Rejected</th></tr></thead>
              <tbody>{reviews.map((r) => (
                <tr key={r.code}><td className="font-mono">{r.code}</td><td>{r.pending}</td><td>{r.confirmed}</td><td>{r.rejected}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section className="card overflow-x-auto p-0">
            <div className="flex items-baseline justify-between px-5 pt-4"><h2 className="h2">Recent changes</h2><Link href="/admin/audit" className="link text-sm">Audit log</Link></div>
            <table className="table">
              <tbody>{recent.map((r) => (
                <tr key={r.log_id}>
                  <td><Badge value={r.operation} /></td>
                  <td className="font-mono text-xs">{r.table_name} #{r.row_pk}</td>
                  <td className="text-xs">{r.actor ?? <span className="muted">system</span>}</td>
                  <td className="muted text-xs">{date(r.logged_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
