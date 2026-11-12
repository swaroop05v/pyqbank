import { query, queryOne } from '@/lib/db';
import { ApiForm } from '@/components/client';
import { PageHeader, date } from '@/components/ui';

export default async function SettingsPage() {
  const s = await queryOne<{ auto_threshold: string; review_threshold: string; updated_at: string; updated_by: string | null }>(
    `SELECT d.auto_threshold, d.review_threshold, d.updated_at, u.full_name AS updated_by
     FROM detection_settings d LEFT JOIN users u ON u.user_id = d.updated_by WHERE d.id = 1`);
  // how the existing suggestions are spread over similarity bands (CASE + GROUP BY)
  const bands = await query<{ band: string; pairs: number; confirmed: number; rejected: number }>(
    `SELECT CASE WHEN similarity >= 0.9 THEN '0.90 - 1.00' WHEN similarity >= 0.8 THEN '0.80 - 0.90'
                 WHEN similarity >= 0.7 THEN '0.70 - 0.80' ELSE '0.60 - 0.70' END AS band,
            COUNT(*)::int AS pairs,
            COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM repeat_candidates GROUP BY 1 ORDER BY 1 DESC`);

  return (
    <>
      <PageHeader title="Repeat detection settings" subtitle="How similar two questions must be (cosine similarity of their embeddings) for the detector to act." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
          <ApiForm url="/api/admin/settings" method="PUT" submitLabel="Save thresholds">
            <div>
              <label className="label" htmlFor="auto_threshold">Auto-group at or above</label>
              <input className="input" id="auto_threshold" name="auto_threshold" type="number" step="0.01" min="0" max="1" defaultValue={Number(s?.auto_threshold)} data-number />
            </div>
            <div>
              <label className="label" htmlFor="review_threshold">Send to faculty review at or above</label>
              <input className="input" id="review_threshold" name="review_threshold" type="number" step="0.01" min="0" max="1" defaultValue={Number(s?.review_threshold)} data-number />
            </div>
          </ApiForm>
          <p className="muted text-xs">
            Last changed {date(s?.updated_at ?? null)}{s?.updated_by ? ` by ${s.updated_by}` : ''}. The CHECK constraint chk_thresholds
            keeps review &lt; auto ≤ 1. New thresholds apply to questions added from now on.
          </p>
        </section>
        <section className="card space-y-3 text-sm">
          <h2 className="h2">How the defaults were chosen</h2>
          <p>We embedded every seed question and compared all pairs:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Rewordings of the same question: median similarity <b>0.80</b>, 10th percentile 0.64.</li>
            <li>Different questions from the same unit: at most <b>0.73</b>.</li>
          </ul>
          <p>So at <b>0.80</b> automatic grouping makes no false matches, and the <b>0.60 to 0.80</b> band catches most remaining rewordings for a human to confirm.</p>
          <table className="table">
            <thead><tr><th>Similarity</th><th>Suggestions</th><th>Confirmed</th><th>Rejected</th></tr></thead>
            <tbody>{bands.map((b) => <tr key={b.band}><td className="font-mono">{b.band}</td><td>{b.pairs}</td><td>{b.confirmed}</td><td>{b.rejected}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
