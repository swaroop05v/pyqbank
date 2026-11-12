import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// One pool per server process (kept on globalThis so dev hot-reload doesn't leak pools).
// Credentials come only from the DATABASE_URL environment variable.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');
  const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL);
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: isLocal ? 1 : 5, // local PGlite is a single engine: one connection keeps transactions isolated
  });
}

function createPoolWithHandlers() {
  const p = createPool();
  // A connection that errors while checked out must not crash the server process
  p.on('connect', (client) => client.on('error', (err) => console.error('pg client error:', err.message)));
  p.on('error', (err) => console.error('pg pool error:', err.message));
  return p;
}

export const pool = globalForPg.pgPool ?? (globalForPg.pgPool = createPoolWithHandlers());

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside BEGIN/COMMIT on a single connection, rolling back on any error.
 * `actorId` is stored in the transaction-local setting app.user_id so the
 * audit trigger can record who made each change.
 */
export async function withTransaction<T>(actorId: number | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN');
    if (actorId) await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(actorId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    failed = true;
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release(failed); // true = discard the connection instead of reusing it after an error
  }
}

// Plain-English explanations for the CHECK / UNIQUE constraints in db/01_schema.sql
const constraintMessages: Record<string, string> = {
  chk_srn: 'SRN must look like PES1UG23CS123 (PES1/PES2, UG, 2-digit year, 2-letter branch, 3 digits)',
  chk_semester: 'Semester must be between 1 and 8',
  chk_email_format: 'Please enter a valid email address',
  chk_email_lower: 'Email must be in lower case',
  chk_name_len: 'Name must be at least 2 characters',
  chk_course_code: 'Course code must look like UE23CS351A',
  chk_course_sem: 'Semester must be between 1 and 8',
  chk_credits: 'Credits must be between 1 and 6',
  chk_unit_no: 'Unit number must be between 1 and 5',
  chk_exam_year: 'Exam year must be between 2015 and 2035',
  chk_max_marks: 'Maximum marks must be between 10 and 100',
  chk_duration: 'Duration must be between 30 and 240 minutes',
  chk_q_label: 'Question number must look like 1, 1a or 12c',
  chk_marks: 'Marks must be more than 0 and at most 20',
  chk_body_len: 'Question text must be at least 10 characters',
  chk_thresholds: 'Review threshold must be above 0 and below the auto-group threshold (at most 1)',
  users_email_key: 'An account with this email already exists',
  students_srn_key: 'A student with this SRN is already registered',
  courses_code_key: 'A course with this code already exists',
  uq_unit_no: 'This course already has a unit with that number',
  uq_topic_name: 'This unit already has a topic with that name',
  uq_paper: 'This paper (course, exam type and year) already exists',
  uq_q_label: 'This paper already has a question with that number',
  faculty_courses_pkey: 'This faculty member is already assigned to the course',
  bookmarks_pkey: 'Already bookmarked',
};

/** Turns a Postgres error into a message that is safe and useful to show users. */
export function dbErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; constraint?: string; detail?: string };
  if (e.constraint && constraintMessages[e.constraint]) return constraintMessages[e.constraint];
  switch (e.code) {
    case '23505':
      return `Duplicate value: ${e.detail ?? e.constraint ?? 'already exists'}`;
    case '23503':
      return `Referenced record does not exist (${e.constraint})`;
    case '23001':
      return `Still referenced by other records (${e.constraint}, ON DELETE RESTRICT)`;
    case '23514':
      return e.constraint ? `Invalid value (violates ${e.constraint})` : e.message ?? 'Check constraint failed';
    case '23502':
      return 'A required field is missing';
    case '22P02':
    case '22003':
    case '22001':
      return 'A value has the wrong format or is too long';
    case 'P0001':
      return e.message ?? 'Rejected by database rule';
    default:
      console.error(err);
      return 'Database error';
  }
}
