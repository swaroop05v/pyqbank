import { requirePage } from '@/lib/auth';
import { Shell } from '@/components/Nav';

export const dynamic = 'force-dynamic';

// The question bank is readable by every logged-in role
export default async function BankLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePage('admin', 'faculty', 'student');
  return <Shell session={session}>{children}</Shell>;
}
