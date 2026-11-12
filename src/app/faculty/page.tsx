import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { query } from '@/lib/db';
import { ApiForm } from '@/components/client';
import { Badge, Empty, PageHeader, Stat } from '@/components/ui';

export default async function FacultyHome() {
  const s = await requirePage('faculty');
  const courses = await query<{ course_id: number; code: string; name: string; pending: number; papers: number; drafts: number }>(
    `SELECT c.course_id, c.code, c.name,
            (SELECT COUNT(*) FROM repeat_candidates rc WHERE rc.status = 'pending' AND fn_question_course(rc.q_low) = c.course_id)::int AS pending,
            (SELECT COUNT(*) FROM exam_papers p WHERE p.course_id = c.course_id AND p.status = 'published')::int AS papers,
            (SELECT COUNT(*) FROM exam_papers p WHERE p.course_id = c.course_id AND p.status = 'draft')::int AS drafts
     FROM faculty_courses fc JOIN courses c ON c.course_id = fc.course_id
     WHERE fc.faculty_id = $1 ORDER BY c.code`, [s.userId]);
  const papers = await query<{ paper_id: number; course_code: string; exam_type: string; exam_year: number; status: string;
    questions: number; repeated_questions: number }>(
    `SELECT v.paper_id, v.course_code, v.exam_type, v.exam_year, v.status, v.questions, v.repeated_questions
     FROM v_paper_summary v
     WHERE v.course_id IN (SELECT course_id FROM faculty_courses WHERE faculty_id = $1)
     ORDER BY (v.status = 'draft') DESC, v.exam_year DESC, v.exam_type DESC
     LIMIT 40`, [s.userId]);
  const pending = courses.reduce((n, c) => n + c.pending, 0);
  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageHeader title="My papers" subtitle="Upload papers for your courses and review suggested repeats.">
        <Link href="/faculty/review" className="btn-primary">Review queue ({pending})</Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        {courses.map((c) => (
          <Stat key={c.course_id} label={c.code} value={`${c.papers} papers`} hint={`${c.name} · ${c.drafts} draft(s) · ${c.pending} to review`} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-1">
          <h2 className="h2 mb-3">New paper</h2>
          {courses.length === 0 ? <Empty>You are not assigned to any course yet. Ask the exam cell.</Empty> : (
            <ApiForm url="/api/faculty/papers" submitLabel="Create draft">
              <div>
                <label className="label" htmlFor="course_id">Course</label>
                <select className="input" id="course_id" name="course_id" data-number required>
                  {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="exam_type">Exam</label>
                  <select className="input" id="exam_type" name="exam_type"><option>ISA1</option><option>ISA2</option><option>ESA</option></select>
                </div>
                <div>
                  <label className="label" htmlFor="exam_year">Year</label>
                  <input className="input" id="exam_year" name="exam_year" type="number" defaultValue={thisYear} data-number required />
                </div>
                <div>
                  <label className="label" htmlFor="max_marks">Max marks</label>
                  <input className="input" id="max_marks" name="max_marks" type="number" defaultValue={40} data-number required />
                </div>
                <div>
                  <label className="label" htmlFor="duration_min">Minutes</label>
                  <input className="input" id="duration_min" name="duration_min" type="number" defaultValue={90} data-number required />
                </div>
              </div>
            </ApiForm>
          )}
        </section>
        <section className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="table">
            <thead><tr><th>Paper</th><th>Status</th><th>Questions</th><th>Repeats from earlier</th><th></th></tr></thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.paper_id}>
                  <td className="font-medium">{p.course_code} · {p.exam_type} {p.exam_year}</td>
                  <td><Badge value={p.status} /></td>
                  <td className="tabular-nums">{p.questions}</td>
                  <td className="tabular-nums">{p.repeated_questions}</td>
                  <td>
                    <Link className="link text-sm" href={p.status === 'draft' ? `/faculty/papers/${p.paper_id}` : `/bank/paper/${p.paper_id}`}>
                      {p.status === 'draft' ? 'Edit' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
