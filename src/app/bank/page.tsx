import Link from 'next/link';
import { query } from '@/lib/db';
import { PageHeader } from '@/components/ui';

type Row = { course_id: number; code: string; name: string; semester: number; papers: number; questions: number;
  groups: number; first_year: number | null; last_year: number | null };

export default async function BankHome() {
  const courses = await query<Row>(
    `SELECT c.course_id, c.code, c.name, c.semester,
            COUNT(DISTINCT p.paper_id)::int     AS papers,
            COUNT(q.question_id)::int           AS questions,
            (SELECT COUNT(*) FROM v_repeat_groups g WHERE g.course_id = c.course_id)::int AS groups,
            MIN(p.exam_year) AS first_year, MAX(p.exam_year) AS last_year
     FROM courses c
     LEFT JOIN exam_papers p ON p.course_id = c.course_id AND p.status = 'published'
     LEFT JOIN questions q   ON q.paper_id = p.paper_id
     GROUP BY c.course_id
     ORDER BY c.semester DESC, c.code`);

  return (
    <>
      <PageHeader title="Question Bank" subtitle="Pick a course to see its most repeated questions, unit weightage and past papers.">
        <Link href="/bank/search" className="btn-primary">Search all questions</Link>
      </PageHeader>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <Link key={c.course_id} href={`/bank/course/${c.course_id}`} className="card block transition hover:border-brand-500">
            <div className="font-mono text-xs text-stone-500">{c.code} · Semester {c.semester}</div>
            <div className="mt-1 text-lg font-semibold">{c.name}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><div className="text-xl font-bold tabular-nums">{c.papers}</div><div className="muted text-xs">papers</div></div>
              <div><div className="text-xl font-bold tabular-nums">{c.questions}</div><div className="muted text-xs">questions</div></div>
              <div><div className="text-xl font-bold tabular-nums text-amber-700">{c.groups}</div><div className="muted text-xs">repeats</div></div>
            </div>
            <div className="muted mt-3 text-xs">{c.first_year ? `${c.first_year} to ${c.last_year}` : 'No papers yet'}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
