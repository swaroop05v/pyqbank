import Link from 'next/link';
import { ApiForm } from '@/components/client';

const demo = [
  ['Admin (exam cell)', 'admin@pyqbank.test', 'Admin@123'],
  ['Faculty (DBMS)', 'faculty@pyqbank.test', 'Faculty@123'],
  ['Student', 'student@pyqbank.test', 'Student@123'],
];

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-2">
      <section>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-600 text-sm font-black text-white">PYQ</span>
          <h1 className="text-4xl font-bold tracking-tight">PYQ Bank</h1>
        </div>
        <p className="mt-4 text-lg text-stone-700">
          Every previous-year exam question in one place, with automatic detection of questions that keep coming back,
          even when they are worded differently.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-stone-600">
          <li>• PostgreSQL for courses, units, papers, questions and reviews</li>
          <li>• pgvector embeddings that spot reworded repeats across years</li>
          <li>• Separate views for students, faculty and the exam cell</li>
        </ul>
      </section>
      <section className="card">
        <h2 className="h2 mb-4">Sign in</h2>
        <ApiForm url="/api/auth/login" submitLabel="Sign in">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
        </ApiForm>
        <p className="muted mt-4">
          New student? <Link className="link" href="/register">Create an account</Link>
        </p>
        <div className="mt-6 rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
          <div className="mb-1 font-semibold">Demo accounts (seed data)</div>
          {demo.map(([role, email, pw]) => (
            <div key={role} className="font-mono">{role}: {email} / {pw}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
