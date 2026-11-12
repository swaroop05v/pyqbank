import Link from 'next/link';
import type { Session } from '@/lib/session';
import { Badge } from './ui';

const links: Record<Session['role'], [string, string][]> = {
  student: [['/student', 'Dashboard'], ['/bank', 'Question Bank'], ['/bank/search', 'Search']],
  faculty: [['/faculty', 'My Papers'], ['/faculty/review', 'Review Queue'], ['/bank', 'Question Bank'], ['/bank/search', 'Search']],
  admin: [['/admin', 'Dashboard'], ['/admin/courses', 'Courses'], ['/admin/users', 'Users'], ['/admin/settings', 'Detection'],
    ['/admin/queries', 'SQL Lab'], ['/admin/audit', 'Audit Log'], ['/bank', 'Question Bank']],
};

function Nav({ session }: { session: Session }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={`/${session.role}`} className="flex items-center gap-2 text-lg font-bold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-black text-white">PYQ</span>
          PYQ Bank
        </Link>
        <nav className="flex flex-wrap gap-1">
          {links[session.role].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-stone-600">{session.name} <Badge value={session.role} /></span>
          <form action="/api/auth/logout" method="post">
            <button className="btn-secondary btn-sm">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function Shell({ session, children }: { session: Session; children: React.ReactNode }) {
  return (
    <>
      <Nav session={session} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
