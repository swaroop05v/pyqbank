import Link from 'next/link';
import { query } from '@/lib/db';
import { embedText } from '@/lib/embeddings';
import { PageHeader, RepeatChip, Similarity, Empty } from '@/components/ui';

type SP = Promise<{ q?: string; course?: string; type?: string }>;
type Hit = { question_id: number; paper_id: number; course_code: string; exam_type: string; exam_year: number; q_label: string;
  body: string; marks: string; topic: string; group_id: number | null; group_size: number | null; score: string; snippet?: string };

const examples = ['how are deadlocks prevented', 'normalisation anomalies', 'ranking rows inside each group', 'semantic search with embeddings'];

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const text = (sp.q ?? '').trim().slice(0, 300);
  const course = sp.course ? Number(sp.course) : null;
  const type = ['ISA1', 'ISA2', 'ESA'].includes(sp.type ?? '') ? sp.type! : null;
  const courses = await query<{ course_id: number; code: string; name: string }>(`SELECT course_id, code, name FROM courses ORDER BY code`);

  let keyword: Hit[] = [];
  let semantic: Hit[] = [];
  if (text) {
    // 1) Full-text search: stemmed words, GIN index on body_tsv, ranked with ts_rank
    keyword = await query<Hit>(
      `SELECT d.question_id, d.paper_id, d.course_code, d.exam_type, d.exam_year, d.q_label, d.body, d.marks, d.topic,
              d.group_id, d.group_size,
              ROUND(ts_rank(q.body_tsv, websearch_to_tsquery('english', $1))::numeric, 3) AS score,
              ts_headline('english', d.body, websearch_to_tsquery('english', $1), 'StartSel=<mark>,StopSel=</mark>,HighlightAll=true') AS snippet
       FROM v_question_detail d JOIN questions q ON q.question_id = d.question_id
       WHERE q.body_tsv @@ websearch_to_tsquery('english', $1)
         AND d.paper_status = 'published'
         AND ($2::int IS NULL OR d.course_id = $2)
         AND ($3::exam_type IS NULL OR d.exam_type = $3)
       ORDER BY score DESC, d.exam_year DESC
       LIMIT 15`, [text, course, type]);
    // 2) Semantic search: embed the query, nearest neighbours by cosine distance (HNSW index)
    const vec = await embedText(text);
    semantic = await query<Hit>(
      `SELECT d.question_id, d.paper_id, d.course_code, d.exam_type, d.exam_year, d.q_label, d.body, d.marks, d.topic,
              d.group_id, d.group_size,
              ROUND((1 - (q.embedding <=> $1::vector))::numeric, 3) AS score
       FROM v_question_detail d JOIN questions q ON q.question_id = d.question_id
       WHERE d.paper_status = 'published'
         AND ($2::int IS NULL OR d.course_id = $2)
         AND ($3::exam_type IS NULL OR d.exam_type = $3)
       ORDER BY q.embedding <=> $1::vector
       LIMIT 15`, [vec, course, type]);
  }

  return (
    <>
      <PageHeader title="Search questions" subtitle="Keyword search matches the words you type. Meaning search finds questions that ask the same thing in other words." />
      <form className="card grid gap-3 md:grid-cols-[1fr_14rem_9rem_auto]">
        <input className="input" name="q" defaultValue={text} placeholder="e.g. how are deadlocks prevented" autoFocus />
        <select className="input" name="course" defaultValue={course ?? ''}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code} {c.name}</option>)}
        </select>
        <select className="input" name="type" defaultValue={type ?? ''}>
          <option value="">Any exam</option>
          <option>ISA1</option><option>ISA2</option><option>ESA</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>
      {!text ? (
        <div className="muted flex flex-wrap items-center gap-2">
          Try:
          {examples.map((e) => <Link key={e} className="rounded-full bg-white px-3 py-1 ring-1 ring-stone-200 hover:ring-brand-500" href={`/bank/search?q=${encodeURIComponent(e)}`}>{e}</Link>)}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Results title="Keyword (full-text search)" hint="PostgreSQL tsvector + GIN index, ranked by ts_rank" hits={keyword} kind="kw" />
          <Results title="Meaning (vector search)" hint="pgvector cosine similarity on 384-d embeddings" hits={semantic} kind="vec" />
        </div>
      )}
    </>
  );
}

function Results({ title, hint, hits, kind }: { title: string; hint: string; hits: Hit[]; kind: 'kw' | 'vec' }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="h2">{title}</h2>
        <p className="muted text-xs">{hint}</p>
      </div>
      {hits.length === 0 ? <div className="card"><Empty>No question contains these words.</Empty></div> : hits.map((h) => (
        <div key={h.question_id} className="card space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <Link href={`/bank/paper/${h.paper_id}`} className="link font-semibold">{h.course_code} · {h.exam_type} {h.exam_year} · Q{h.q_label}</Link>
            <div className="flex items-center gap-2">
              <RepeatChip groupId={h.group_id} size={h.group_size} />
              {kind === 'vec' ? <Similarity value={h.score} /> : <span className="tabular-nums text-stone-500">rank {h.score}</span>}
            </div>
          </div>
          {kind === 'kw' && h.snippet
            ? <p className="qtext text-sm" dangerouslySetInnerHTML={{ __html: escapeExceptMark(h.snippet) }} />
            : <p className="qtext text-sm">{h.body}</p>}
          <p className="muted text-xs">{h.topic} · {Number(h.marks)} marks</p>
        </div>
      ))}
    </section>
  );
}

// ts_headline returns the original text with <mark> tags; escape everything else
function escapeExceptMark(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}
