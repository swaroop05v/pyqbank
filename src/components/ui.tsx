import Link from 'next/link';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

const tone: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600 ring-stone-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  ISA1: 'bg-sky-50 text-sky-700 ring-sky-200',
  ISA2: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  ESA: 'bg-violet-50 text-violet-700 ring-violet-200',
  admin: 'bg-stone-800 text-white ring-stone-800',
  faculty: 'bg-brand-50 text-brand-700 ring-brand-100',
  student: 'bg-sky-50 text-sky-700 ring-sky-200',
  INSERT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  UPDATE: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function Badge({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[value] ?? 'bg-stone-100 text-stone-700 ring-stone-200'} ${className}`}>
      {value}
    </span>
  );
}

/** "Asked N times" chip linking to the repeat group. */
export function RepeatChip({ groupId, size }: { groupId: number | null; size: number | string | null }) {
  if (!groupId || !size || Number(size) < 2) return null;
  return (
    <Link href={`/bank/group/${groupId}`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset hover:bg-amber-100">
      ↻ asked {size}×
    </Link>
  );
}

/** Cosine similarity shown as a small bar plus a percentage. */
export function Similarity({ value }: { value: number | string | null }) {
  if (value === null || value === undefined) return <span className="muted">n/a</span>;
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
  const color = pct >= 80 ? 'bg-brand-500' : pct >= 60 ? 'bg-amber-500' : 'bg-stone-400';
  return (
    <div className="flex items-center gap-2" title={`cosine similarity ${Number(value).toFixed(3)}`}>
      <div className="h-1.5 w-16 rounded-full bg-stone-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-stone-600">{pct}%</span>
    </div>
  );
}

/** Horizontal bar for percentages (unit weightage etc.). */
export function Bar({ pct, label }: { pct: number | string | null; label?: string }) {
  const v = Math.max(0, Math.min(100, Number(pct ?? 0)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${v}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-stone-600">{label ?? `${v.toFixed(1)}%`}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted py-6 text-center">{children}</p>;
}

export const paperName = (type: string, year: number | string) => `${type} ${year}`;
export const marks = (v: number | string) => `${Number(v)} m`;

export const date = (v: string | Date | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
