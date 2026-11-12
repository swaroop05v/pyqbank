import Link from 'next/link';
import { query } from '@/lib/db';
import { Badge, PageHeader, date } from '@/components/ui';

type SP = Promise<{ table?: string }>;
const tables = ['exam_papers', 'questions', 'repeat_candidates', 'repeat_groups', 'detection_settings'];

function changes(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null) {
  if (!oldD || !newD) return null;
  return Object.keys(newD).filter((k) => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
    .map((k) => `${k}: ${JSON.stringify(oldD[k])} → ${JSON.stringify(newD[k])}`);
}

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const { table } = await searchParams;
  const t = tables.includes(table ?? '') ? table! : null;
  const rows = await query<{ log_id: number; table_name: string; operation: string; row_pk: string; actor: string | null;
    old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; logged_at: string }>(
    `SELECT a.log_id, a.table_name, a.operation, a.row_pk, u.full_name AS actor, a.old_data, a.new_data, a.logged_at
     FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
     WHERE $1::text IS NULL OR a.table_name = $1
     ORDER BY a.log_id DESC LIMIT 100`, [t]);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Written only by the trg_fn_audit trigger. 'system' means the repeat detector or the seed script." />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/audit" className={`rounded-full px-3 py-1 ${!t ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-stone-200'}`}>All</Link>
        {tables.map((x) => <Link key={x} href={`/admin/audit?table=${x}`} className={`rounded-full px-3 py-1 font-mono ${t === x ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-stone-200'}`}>{x}</Link>)}
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Change</th><th>Row</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const diff = changes(r.old_data, r.new_data);
              return (
                <tr key={r.log_id}>
                  <td className="whitespace-nowrap text-xs">{date(r.logged_at)}</td>
                  <td className="text-xs">{r.actor ?? <span className="muted">system</span>}</td>
                  <td><Badge value={r.operation} /></td>
                  <td className="whitespace-nowrap font-mono text-xs">{r.table_name} #{r.row_pk}</td>
                  <td className="max-w-xl font-mono text-xs text-stone-600">
                    {diff ? diff.join('; ') : JSON.stringify(r.new_data ?? r.old_data).slice(0, 160)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
