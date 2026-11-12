import Link from 'next/link';
import { ApiForm } from '@/components/client';

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="card">
        <h1 className="h1 mb-1">Student registration</h1>
        <p className="muted mb-5">Faculty accounts are created by the exam cell.</p>
        <ApiForm url="/api/auth/register" submitLabel="Create account">
          <div>
            <label className="label" htmlFor="full_name">Full name</label>
            <input className="input" id="full_name" name="full_name" required />
          </div>
          <div>
            <label className="label" htmlFor="srn">SRN</label>
            <input className="input font-mono" id="srn" name="srn" placeholder="PES1UG23CS123" required />
          </div>
          <div>
            <label className="label" htmlFor="semester">Semester</label>
            <input className="input" id="semester" name="semester" type="number" min={1} max={8} defaultValue={5} data-number required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password (8+ characters)</label>
            <input className="input" id="password" name="password" type="password" minLength={8} required />
          </div>
        </ApiForm>
        <p className="muted mt-4">Already registered? <Link className="link" href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
