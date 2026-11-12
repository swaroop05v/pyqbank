import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePage('faculty');
  return <Shell session={session}>{children}</Shell>;
}
