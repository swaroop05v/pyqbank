import { query } from '@/lib/db';
import { ActionButton, ApiForm } from '@/components/client';
import { Badge, PageHeader } from '@/components/ui';

export default async function UsersAdmin() {
  const users = await query<{ user_id: number; email: string; full_name: string; role: string; is_active: boolean; srn: string | null; courses: string | null }>(
    `SELECT u.user_id, u.email, u.full_name, u.role, u.is_active, s.srn,
            string_agg(c.code, ', ' ORDER BY c.code) AS courses
     FROM users u
     LEFT JOIN students s         ON s.student_id = u.user_id
     LEFT JOIN faculty_courses fc ON fc.faculty_id = u.user_id
     LEFT JOIN courses c          ON c.course_id = fc.course_id
     GROUP BY u.user_id, s.srn
     ORDER BY u.role, u.full_name`);
  const courses = await query<{ course_id: number; code: string }>(`SELECT course_id, code FROM courses ORDER BY code`);
  const faculty = users.filter((u) => u.role === 'faculty');

  return (
    <>
      <PageHeader title="Users" subtitle="Students register themselves; faculty accounts and course assignments are managed here." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Create faculty account</h2>
          <ApiForm url="/api/admin/users" submitLabel="Create" resetOnSuccess>
            <input className="input" name="full_name" placeholder="Full name" required />
            <input className="input" name="email" type="email" placeholder="Email" required />
            <input className="input" name="password" type="password" placeholder="Initial password (8+ characters)" minLength={8} required />
          </ApiForm>
        </section>
        <section className="card">
          <h2 className="h2 mb-3">Assign faculty to a course</h2>
          <ApiForm url="/api/admin/assignments" submitLabel="Assign">
            <select className="input" name="faculty_id" data-number>{faculty.map((f) => <option key={f.user_id} value={f.user_id}>{f.full_name}</option>)}</select>
            <select className="input" name="course_id" data-number>{courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code}</option>)}</select>
          </ApiForm>
        </section>
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>SRN / Courses</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className={u.is_active ? '' : 'opacity-50'}>
                <td className="font-medium">{u.full_name}</td>
                <td className="font-mono text-xs">{u.email}</td>
                <td><Badge value={u.role} /></td>
                <td className="text-xs">
                  {u.srn && <span className="font-mono">{u.srn}</span>}
                  {u.role === 'faculty' && !u.courses && <span className="muted">no courses</span>}
                  {u.role === 'faculty' && u.courses?.split(', ').map((code) => {
                    const c = courses.find((x) => x.code === code)!;
                    return <ActionButton key={code} url="/api/admin/assignments" method="DELETE" body={{ faculty_id: u.user_id, course_id: c.course_id }}
                      label={`${code} ×`} className="btn-secondary btn-sm mr-1 font-mono" confirm={`Unassign ${u.full_name} from ${code}?`} />;
                  })}
                </td>
                <td>{u.is_active ? 'active' : 'disabled'}</td>
                <td>
                  {u.role !== 'admin' && (
                    <ActionButton url={`/api/admin/users/${u.user_id}`} method="PATCH" body={{ is_active: !u.is_active }}
                      label={u.is_active ? 'Disable' : 'Enable'} className="btn-secondary btn-sm" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
