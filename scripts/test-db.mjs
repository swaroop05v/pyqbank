// Database test cases: constraints, triggers, the repeat detector, procedures,
// transactions, locking, views, full-text and vector search.
// Every test runs inside BEGIN ... ROLLBACK, so the database is left exactly as it was.
// Results are also written to docs/test-results.md.   Run with:  npm run test:db
import fs from 'node:fs';
import { getClient } from './lib.mjs';

const client = getClient();
await client.connect();
const q = (text, params) => client.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];
const isLocal = /@127\.0\.0\.1:5433/.test(process.env.DATABASE_URL);   // the embedded PGlite server (npm run db:local)

// ---------- fixtures (created inside each test's transaction) ----------
const ids = await (async () => {
  const r = await one(`SELECT
    (SELECT user_id FROM users WHERE email = 'admin@pyqbank.test')        AS admin,
    (SELECT user_id FROM users WHERE email = 'faculty@pyqbank.test')      AS dbms_faculty,
    (SELECT user_id FROM users WHERE email = 'os.faculty@pyqbank.test')   AS os_faculty,
    (SELECT user_id FROM users WHERE email = 'student@pyqbank.test')      AS student,
    (SELECT course_id FROM courses WHERE code = 'UE23CS351A')             AS dbms,
    (SELECT course_id FROM courses WHERE code = 'UE23CS242B')             AS os`);
  return r;
})();
const topicOf = async (course) =>
  (await one(`SELECT t.topic_id FROM topics t JOIN units u ON u.unit_id = t.unit_id WHERE u.course_id = $1 ORDER BY t.topic_id LIMIT 1`, [course])).topic_id;

// Test papers use exam year 2034, which no real or demo paper uses, so the tests still work
// after someone has created papers through the app (e.g. the ISA1 2026 demo paper).
async function draftPaper(course = ids.dbms, year = 2034, type = 'ISA1') {
  return (await one(
    `INSERT INTO exam_papers (course_id, exam_type, exam_year, max_marks, uploaded_by) VALUES ($1, $2, $3, 40, $4) RETURNING paper_id`,
    [course, type, year, ids.admin])).paper_id;
}
async function addQuestion(paper, { label = '1a', body = 'A brand new test question about databases', topic, embedding = null, course = ids.dbms } = {}) {
  return (await one(
    `INSERT INTO questions (paper_id, q_label, topic_id, marks, body, embedding) VALUES ($1, $2, $3, 5, $4, $5) RETURNING question_id`,
    [paper, label, topic ?? (await topicOf(course)), body, embedding])).question_id;
}
const parseVec = (s) => s.slice(1, -1).split(',').map(Number);
const fmtVec = (v) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;
// a unit vector whose cosine similarity with `base` is exactly `cos`
function vectorAtSimilarity(base, cos, seed = 7) {
  let r = base.map((_, i) => Math.sin(i * 12.9898 + seed) * 43758.5453 % 1);
  const dot = r.reduce((s, x, i) => s + x * base[i], 0);
  r = r.map((x, i) => x - dot * base[i]);                       // remove the component along base
  const n = Math.hypot(...r);
  r = r.map((x) => x / n);                                       // unit vector orthogonal to base
  return base.map((b, i) => cos * b + Math.sqrt(1 - cos * cos) * r[i]);
}
async function anyDbmsQuestion() {
  return one(`SELECT q.question_id, q.body, q.embedding::text AS emb, q.group_id FROM questions q
              JOIN exam_papers p ON p.paper_id = q.paper_id
              WHERE p.course_id = $1 AND q.group_id IS NOT NULL ORDER BY q.question_id LIMIT 1`, [ids.dbms]);
}
async function expectError(fn, pattern) {
  await q('SAVEPOINT expect_error');
  try {
    await fn();
  } catch (err) {
    await q('ROLLBACK TO SAVEPOINT expect_error');
    if (pattern && !pattern.test(err.message)) throw new Error(`wrong error: ${err.message}`);
    return err.message;
  }
  throw new Error('expected an error but the statement succeeded');
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- test cases ----------
const tests = [
  // --- constraints (validation at database level)
  ['CHECK: malformed SRN is rejected', 'Constraint', () =>
    expectError(() => q(`UPDATE students SET srn = 'ABC123' WHERE student_id = $1`, [ids.student]), /chk_srn/)],

  ['CHECK: invalid email format is rejected', 'Constraint', () =>
    expectError(() => q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('not-an-email', 'x', 'Bad', 'student')`), /chk_email_format/)],

  ['UNIQUE: duplicate email is rejected', 'Constraint', () =>
    expectError(() => q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('admin@pyqbank.test', 'x', 'Dup', 'admin')`), /duplicate key/)],

  ['UNIQUE: the same exam paper cannot be added twice', 'Constraint', () =>
    expectError(() => q(`INSERT INTO exam_papers (course_id, exam_type, exam_year, max_marks) VALUES ($1, 'ESA', 2025, 100)`, [ids.dbms]), /uq_paper/)],

  ['CHECK: question marks must be between 0 and 20', 'Constraint', async () => {
    const p = await draftPaper();
    const topic = await topicOf(ids.dbms);
    return expectError(() => q(`INSERT INTO questions (paper_id, q_label, topic_id, marks, body) VALUES ($1, '1a', $2, 25, 'A question with too many marks')`, [p, topic]), /chk_marks/);
  }],

  ['CHECK: question label must look like 1a / 12 / 3c', 'Constraint', async () => {
    const p = await draftPaper();
    return expectError(() => addQuestion(p, { label: 'Q1' }), /chk_q_label/);
  }],

  ['CHECK: review threshold must stay below the auto threshold', 'Constraint', () =>
    expectError(() => q(`UPDATE detection_settings SET review_threshold = 0.9, auto_threshold = 0.8`), /chk_thresholds/)],

  ['ENUM: unknown exam type is rejected', 'Constraint', () =>
    expectError(() => q(`INSERT INTO exam_papers (course_id, exam_type, exam_year, max_marks) VALUES ($1, 'MIDSEM', 2026, 40)`, [ids.dbms]), /invalid input value for enum/)],

  ['FOREIGN KEY: a course with papers cannot be deleted (ON DELETE RESTRICT)', 'Constraint', () =>
    expectError(() => q(`DELETE FROM courses WHERE course_id = $1`, [ids.dbms]), /foreign key|still referenced|violates/)],

  // --- triggers (integrity rules that constraints cannot express)
  ['TRIGGER: a question cannot use a topic from another course', 'Trigger', async () => {
    const p = await draftPaper(ids.dbms);
    const topic = await topicOf(ids.os);
    return expectError(() => addQuestion(p, { topic }), /does not belong/);
  }],

  ['TRIGGER: questions of a published paper cannot be edited', 'Trigger', async () => {
    const qq = await anyDbmsQuestion();
    return expectError(() => q(`UPDATE questions SET body = body || ' (edited)' WHERE question_id = $1`, [qq.question_id]), /published/);
  }],

  ['TRIGGER: questions of a published paper cannot be deleted', 'Trigger', async () => {
    const qq = await anyDbmsQuestion();
    return expectError(() => q(`DELETE FROM questions WHERE question_id = $1`, [qq.question_id]), /published/);
  }],

  ['TRIGGER: a published paper cannot be moved back to draft', 'Trigger', async () =>
    expectError(() => q(`UPDATE exam_papers SET status = 'draft' WHERE course_id = $1 AND exam_year = 2025 AND exam_type = 'ESA'`, [ids.dbms]), /cannot be unpublished/)],

  ['TRIGGER: editing a draft question clears its stale embedding', 'Trigger', async () => {
    const p = await draftPaper();
    const qq = await anyDbmsQuestion();
    const id = await addQuestion(p, { body: 'Original wording of a draft question', embedding: fmtVec(vectorAtSimilarity(parseVec(qq.emb), 0.1)) });
    await q(`UPDATE questions SET body = 'Changed wording of the draft question' WHERE question_id = $1`, [id]);
    const r = await one(`SELECT embedding IS NULL AS cleared FROM questions WHERE question_id = $1`, [id]);
    assert(r.cleared, 'embedding was not cleared');
    return 'embedding set to NULL after the text changed';
  }],

  ['TRIGGER: only faculty accounts can be assigned to a course', 'Trigger', () =>
    expectError(() => q(`INSERT INTO faculty_courses (faculty_id, course_id) VALUES ($1, $2)`, [ids.student, ids.dbms]), /Only faculty/)],

  ['TRIGGER: students cannot bookmark questions of a draft paper', 'Trigger', async () => {
    const p = await draftPaper();
    const id = await addQuestion(p);
    return expectError(() => q(`INSERT INTO bookmarks (student_id, question_id) VALUES ($1, $2)`, [ids.student, id]), /published papers/);
  }],

  // --- the repeat detector (vector similarity inside a trigger)
  ['DETECTOR: an exact copy of an old question is grouped with it automatically', 'Detector', async () => {
    const old = await anyDbmsQuestion();
    const p = await draftPaper();
    const id = await addQuestion(p, { body: old.body, embedding: old.emb });
    const r = await one(`SELECT group_id, fn_similarity($1, $2) AS sim FROM questions WHERE question_id = $1`, [id, old.question_id]);
    assert(r.group_id === old.group_id, `expected group ${old.group_id}, got ${r.group_id}`);
    return `joined group ${r.group_id} (similarity ${r.sim})`;
  }],

  ['DETECTOR: a moderately similar question goes to the faculty review queue', 'Detector', async () => {
    const old = await anyDbmsQuestion();
    const p = await draftPaper();
    const id = await addQuestion(p, { embedding: fmtVec(vectorAtSimilarity(parseVec(old.emb), 0.7)) });
    const r = await one(`SELECT group_id FROM questions WHERE question_id = $1`, [id]);
    const c = await one(`SELECT similarity, status FROM repeat_candidates WHERE q_high = $1 AND q_low = $2`, [id, old.question_id]);
    assert(r.group_id === null && c && c.status === 'pending', JSON.stringify({ r, c }));
    return `not grouped; pending pair with similarity ${c.similarity}`;
  }],

  ['DETECTOR: an unrelated question is neither grouped nor flagged', 'Detector', async () => {
    const old = await anyDbmsQuestion();
    const p = await draftPaper();
    const id = await addQuestion(p, { embedding: fmtVec(vectorAtSimilarity(parseVec(old.emb), 0.05)) });
    const r = await one(`SELECT q.group_id, (SELECT COUNT(*) FROM repeat_candidates WHERE q_low = $1 OR q_high = $1)::int AS flagged
                         FROM questions q WHERE q.question_id = $1`, [id]);
    assert(r.group_id === null && r.flagged === 0, JSON.stringify(r));
    return 'no group, no suggestions';
  }],

  ['DETECTOR: questions are only compared within the same course', 'Detector', async () => {
    const old = await anyDbmsQuestion();
    const p = await draftPaper(ids.os);
    const id = await addQuestion(p, { body: old.body, embedding: old.emb, course: ids.os });
    const r = await one(`SELECT group_id FROM questions WHERE question_id = $1`, [id]);
    assert(r.group_id === null, `grouped across courses: ${r.group_id}`);
    return 'identical DBMS text in an OS paper was not matched';
  }],

  ['DETECTOR: raising the thresholds stops automatic grouping', 'Detector', async () => {
    await q(`UPDATE detection_settings SET auto_threshold = 0.99, review_threshold = 0.95`);
    const old = await anyDbmsQuestion();
    const p = await draftPaper();
    const id = await addQuestion(p, { embedding: fmtVec(vectorAtSimilarity(parseVec(old.emb), 0.9)) });
    const r = await one(`SELECT group_id FROM questions WHERE question_id = $1`, [id]);
    assert(r.group_id === null, 'should not be grouped at similarity 0.9 with threshold 0.99');
    return 'similarity 0.90 < 0.99: not grouped';
  }],

  // --- stored procedures and transactions
  ['PROCEDURE: confirming a suggested pair puts both questions in one group', 'Procedure', async () => {
    const c = await one(`SELECT q_low, q_high FROM repeat_candidates WHERE status = 'pending' ORDER BY q_low LIMIT 1`);
    const course = await one(`SELECT fn_question_course($1) AS c`, [c.q_low]);
    const reviewer = course.c === ids.dbms ? ids.dbms_faculty : ids.os_faculty;
    await q(`CALL sp_review_candidate($1, $2, 'confirmed', $3)`, [c.q_low, c.q_high, reviewer]);
    const r = await one(`SELECT a.group_id AS ga, b.group_id AS gb FROM questions a, questions b WHERE a.question_id = $1 AND b.question_id = $2`, [c.q_low, c.q_high]);
    assert(r.ga !== null && r.ga === r.gb, JSON.stringify(r));
    return `both now in group ${r.ga}`;
  }],

  ['PROCEDURE: a pair cannot be reviewed twice', 'Procedure', async () => {
    const c = await one(`SELECT q_low, q_high FROM repeat_candidates WHERE status = 'pending' AND fn_question_course(q_low) = $1 LIMIT 1`, [ids.dbms]);
    await q(`CALL sp_review_candidate($1, $2, 'rejected', $3)`, [c.q_low, c.q_high, ids.dbms_faculty]);
    return expectError(() => q(`CALL sp_review_candidate($1, $2, 'confirmed', $3)`, [c.q_low, c.q_high, ids.dbms_faculty]), /already reviewed/);
  }],

  ['AUTHORIZATION: faculty cannot review pairs of a course they do not teach', 'Procedure', async () => {
    const c = await one(`SELECT q_low, q_high FROM repeat_candidates WHERE status = 'pending' AND fn_question_course(q_low) = $1 LIMIT 1`, [ids.dbms]);
    return expectError(() => q(`CALL sp_review_candidate($1, $2, 'confirmed', $3)`, [c.q_low, c.q_high, ids.os_faculty]), /not assigned/);
  }],

  ['PROCEDURE: removing a question from a group is remembered as "not a repeat"', 'Procedure', async () => {
    const old = await anyDbmsQuestion();
    await q(`CALL sp_ungroup_question($1, $2)`, [old.question_id, ids.dbms_faculty]);
    const r = await one(`SELECT group_id, (SELECT COUNT(*) FROM repeat_candidates WHERE status = 'rejected' AND (q_low = $1 OR q_high = $1))::int AS rejected
                         FROM questions WHERE question_id = $1`, [old.question_id]);
    assert(r.group_id === null && r.rejected > 0, JSON.stringify(r));
    return `ungrouped; ${r.rejected} pair(s) stored as rejected`;
  }],

  ['PROCEDURE: merging two groups moves every question into one', 'Procedure', async () => {
    const [g1, g2] = (await q(`SELECT group_id FROM repeat_groups WHERE course_id = $1 ORDER BY group_id LIMIT 2`, [ids.dbms])).rows.map((r) => r.group_id);
    const before = await one(`SELECT COUNT(*)::int AS n FROM questions WHERE group_id IN ($1, $2)`, [g1, g2]);
    await q(`CALL sp_merge_groups($1, $2, $3)`, [g1, g2, ids.dbms_faculty]);
    const after = await one(`SELECT COUNT(*)::int AS n, (SELECT COUNT(*) FROM repeat_groups WHERE group_id = $2)::int AS dropped
                             FROM questions WHERE group_id = $1`, [g1, g2]);
    assert(after.n === before.n && after.dropped === 0, JSON.stringify({ before, after }));
    return `${after.n} questions in group ${g1}; group ${g2} deleted`;
  }],

  ['PROCEDURE: a paper with no questions cannot be published', 'Procedure', async () => {
    const p = await draftPaper();
    return expectError(() => q(`CALL sp_publish_paper($1, $2)`, [p, ids.admin]), /at least one question/);
  }],

  ['PROCEDURE: a paper with un-embedded questions cannot be published', 'Procedure', async () => {
    const p = await draftPaper();
    await addQuestion(p);
    return expectError(() => q(`CALL sp_publish_paper($1, $2)`, [p, ids.admin]), /no embedding/);
  }],

  ['TRANSACTION: a failure inside a transaction rolls back the earlier statements', 'Transaction', async () => {
    await q('SAVEPOINT tx');
    const before = await one(`SELECT COUNT(*)::int AS n FROM exam_papers`);
    const p = await draftPaper(ids.dbms, 2033);
    await addQuestion(p, { label: '1a' });
    try {
      await addQuestion(p, { label: '1a' });          // duplicate label -> uq_q_label
    } catch {
      await q('ROLLBACK TO SAVEPOINT tx');
    }
    const r = await one(`SELECT COUNT(*)::int AS n FROM exam_papers`);
    assert(r.n === before.n, 'paper insert was not undone');
    return 'paper and first question undone after the duplicate label failed';
  }],

  ['LOCKING: a second reviewer waits for the row lock (SELECT ... FOR UPDATE)', 'Transaction', async () => {
    if (isLocal) return 'skipped on the embedded PGlite server (single connection); passes on PostgreSQL / Neon';
    const c = await one(`SELECT q_low, q_high FROM repeat_candidates WHERE status = 'pending' LIMIT 1`);
    await q('COMMIT');                                   // the lock must be visible to another session
    await q('BEGIN');
    await q(`SELECT 1 FROM repeat_candidates WHERE q_low = $1 AND q_high = $2 FOR UPDATE`, [c.q_low, c.q_high]);
    const other = getClient();
    await other.connect();
    try {
      await other.query(`SET lock_timeout = '300ms'`);
      await other.query(`UPDATE repeat_candidates SET status = 'rejected', reviewed_at = now() WHERE q_low = $1 AND q_high = $2`, [c.q_low, c.q_high]);
      throw new Error('second session was not blocked');
    } catch (err) {
      if (!/lock timeout/.test(err.message)) throw err;
      return 'second session blocked: ' + err.message;
    } finally {
      await other.end();
    }
  }],

  // --- views and search
  ['VIEW: v_repeat_groups counts match the base table', 'View', async () => {
    const r = await one(`SELECT (SELECT SUM(appearances) FROM v_repeat_groups)::int AS view_total,
                                (SELECT COUNT(*) FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
                                 WHERE q.group_id IS NOT NULL AND p.status = 'published')::int AS raw_total`);
    assert(r.view_total === r.raw_total, JSON.stringify(r));
    return `${r.view_total} = ${r.raw_total}`;
  }],

  ['VIEW: unit weightage percentages add up to 100 per course', 'View', async () => {
    const { rows } = await q(`SELECT course_code, SUM(pct_marks) AS total FROM v_unit_weightage GROUP BY course_code`);
    assert(rows.every((r) => Math.abs(Number(r.total) - 100) < 0.5), JSON.stringify(rows));
    return rows.map((r) => `${r.course_code}: ${r.total}%`).join(', ');
  }],

  ['FULL-TEXT: keyword search finds questions by word stem', 'Search', async () => {
    const { rows } = await q(`SELECT body FROM questions WHERE body_tsv @@ websearch_to_tsquery('english', 'normalise') LIMIT 5`);
    assert(rows.length > 0, 'no rows');
    return `${rows.length} match(es), e.g. "${rows[0].body.slice(0, 60)}..."`;
  }],

  ['VECTOR: nearest neighbour of a stored question is itself (similarity 1.0)', 'Search', async () => {
    const old = await anyDbmsQuestion();
    const r = await one(`SELECT question_id, ROUND((1 - (embedding <=> $1::vector))::numeric, 4) AS sim
                         FROM questions ORDER BY embedding <=> $1::vector LIMIT 1`, [old.emb]);
    assert(Number(r.sim) > 0.999, JSON.stringify(r));
    return `top hit similarity ${r.sim}`;
  }],
];

// ---------- runner ----------
const results = [];
for (const [name, area, fn] of tests) {
  if (process.env.TRACE) console.error('>>', name);
  await q('BEGIN');
  try {
    const detail = await fn();
    results.push({ name, area, pass: true, detail: String(detail ?? '') });
  } catch (err) {
    results.push({ name, area, pass: false, detail: err.message });
  } finally {
    await q('ROLLBACK');
  }
}
await client.end();

const passed = results.filter((r) => r.pass).length;
for (const [i, r] of results.entries()) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(2)}. [${r.area}] ${r.name}\n        ${r.detail}`);
}
console.log(`\n${passed}/${results.length} tests passed`);

const md = [
  '# Database test results',
  '',
  `Generated by \`npm run test:db\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. ${passed}/${results.length} passed.`,
  'Each test runs inside a transaction that is rolled back, so the data is unchanged afterwards.',
  '',
  '| # | Area | Test case | Result | Observed |',
  '|---|------|-----------|--------|----------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.area} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
  '',
];
// The committed results file comes from a full PostgreSQL server (where the locking test runs).
// On the embedded offline server the results are only printed, so the file is never overwritten.
if (isLocal) {
  console.log('(Offline database: docs/test-results.md was not changed.)');
} else {
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/test-results.md', md.join('\n'));
}
process.exitCode = passed === results.length ? 0 : 1;
