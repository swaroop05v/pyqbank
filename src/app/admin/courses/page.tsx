import { query } from '@/lib/db';
import { ActionButton, ApiForm } from '@/components/client';
import { PageHeader } from '@/components/ui';

export default async function CoursesAdmin() {
  const courses = await query<{ course_id: number; code: string; name: string; semester: number; credits: number; papers: number }>(
    `SELECT c.course_id, c.code, c.name, c.semester, c.credits, COUNT(p.paper_id)::int AS papers
     FROM courses c LEFT JOIN exam_papers p ON p.course_id = c.course_id
     GROUP BY c.course_id ORDER BY c.code`);
  const units = await query<{ unit_id: number; course_id: number; unit_no: number; title: string }>(
    `SELECT unit_id, course_id, unit_no, title FROM units ORDER BY course_id, unit_no`);
  const topics = await query<{ topic_id: number; unit_id: number; name: string; used: number }>(
    `SELECT t.topic_id, t.unit_id, t.name, COUNT(q.question_id)::int AS used
     FROM topics t LEFT JOIN questions q ON q.topic_id = t.topic_id
     GROUP BY t.topic_id ORDER BY t.unit_id, t.name`);

  return (
    <>
      <PageHeader title="Courses, units and topics" subtitle="The syllabus hierarchy every question is tagged against." />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card">
          <h2 className="h2 mb-3">Add course</h2>
          <ApiForm url="/api/admin/courses" submitLabel="Add course" resetOnSuccess>
            <input className="input font-mono" name="code" placeholder="UE23CS341A" required />
            <input className="input" name="name" placeholder="Course name" required />
            <div className="grid grid-cols-2 gap-3">
              <input className="input" name="semester" type="number" placeholder="Semester" data-number required />
              <input className="input" name="credits" type="number" placeholder="Credits" defaultValue={4} data-number required />
            </div>
          </ApiForm>
        </section>
        <section className="card">
          <h2 className="h2 mb-3">Add unit</h2>
          <ApiForm url="/api/admin/units" submitLabel="Add unit" resetOnSuccess>
            <select className="input" name="course_id" data-number>{courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code}</option>)}</select>
            <input className="input" name="unit_no" type="number" placeholder="Unit number (1-5)" data-number required />
            <input className="input" name="title" placeholder="Unit title" required />
          </ApiForm>
        </section>
        <section className="card">
          <h2 className="h2 mb-3">Add topic</h2>
          <ApiForm url="/api/admin/topics" submitLabel="Add topic" resetOnSuccess>
            <select className="input" name="unit_id" data-number>
              {units.map((u) => <option key={u.unit_id} value={u.unit_id}>{courses.find((c) => c.course_id === u.course_id)?.code} · Unit {u.unit_no}</option>)}
            </select>
            <input className="input" name="name" placeholder="Topic name" required />
          </ApiForm>
        </section>
      </div>
      {courses.map((c) => (
        <section key={c.course_id} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-mono text-sm text-stone-500">{c.code}</span> <span className="h2">{c.name}</span>
              <span className="muted"> · Sem {c.semester} · {c.credits} credits · {c.papers} papers</span></div>
            <ActionButton url={`/api/admin/courses/${c.course_id}`} method="DELETE" label="Delete course" className="btn-secondary btn-sm"
              confirm={`Delete ${c.code}? This is refused while papers exist (ON DELETE RESTRICT).`} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {units.filter((u) => u.course_id === c.course_id).map((u) => (
              <div key={u.unit_id} className="rounded-lg bg-stone-50 p-3">
                <div className="text-sm font-semibold">Unit {u.unit_no}: {u.title}</div>
                <ul className="mt-2 space-y-1">
                  {topics.filter((t) => t.unit_id === u.unit_id).map((t) => (
                    <li key={t.topic_id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{t.name} <span className="muted text-xs">({t.used} questions)</span></span>
                      <ActionButton url={`/api/admin/topics/${t.topic_id}`} method="DELETE" label="×" className="btn-ghost btn-sm" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
