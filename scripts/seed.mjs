// Loads demo data: users, courses/units/topics, 5 years of exam papers per course,
// embeddings for every question (which fires the repeat detector), and a few faculty
// review decisions. Re-runnable: it empties the tables first.
//
// Because the seed knows which questions are rewordings of each other (same "family"
// in seed-data.mjs), it also measures how well the detector did and writes
// docs/detection-evaluation.md.
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { getClient, embed, toPgVector } from './lib.mjs';
import { users, courses, years } from './seed-data.mjs';

const client = getClient();
await client.connect();
const q = (text, params) => client.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];

// deterministic random numbers, so every run produces the same papers
let seed = 20261109;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// earlier families of a topic are the "favourite" questions and come up more often
function pickFamily(families, used) {
  const weights = families.map((_, i) => (used.has(i) ? 0 : [0.6, 0.3, 0.1][i] ?? 0.1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return -1;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}

console.log('Clearing tables ...');
await q(`TRUNCATE audit_log, bookmarks, repeat_candidates, questions, repeat_groups, exam_papers,
         faculty_courses, topics, units, courses, students, users RESTART IDENTITY CASCADE`);
// (TRUNCATE ... CASCADE also empties detection_settings because of its FK to users)
await q(`INSERT INTO detection_settings (id, auto_threshold, review_threshold) VALUES (1, 0.800, 0.600)
         ON CONFLICT (id) DO UPDATE SET auto_threshold = 0.800, review_threshold = 0.600, updated_by = NULL`);

// ---------- users ----------
console.log('Users ...');
const hash = async (pw) => bcrypt.hash(pw, 10);
const adminId = (await one(
  `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'admin') RETURNING user_id`,
  [users.admin.email, await hash(users.admin.password), users.admin.name])).user_id;

const facultyIds = {};
const facultyHash = await hash(users.faculty[0].password);
for (const fac of users.faculty) {
  const { user_id } = await one(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'faculty') RETURNING user_id`,
    [fac.email, facultyHash, fac.name]);
  facultyIds[fac.email] = user_id;
}

const studentHash = await hash(users.studentPassword);
const studentIds = [];
for (const [email, name, srn, sem] of users.students) {
  const { user_id } = await one(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'student') RETURNING user_id`,
    [email, studentHash, name]);
  await q(`INSERT INTO students (student_id, srn, semester) VALUES ($1, $2, $3)`, [user_id, srn, sem]);
  studentIds.push(user_id);
}

// ---------- courses, units, topics, faculty assignments ----------
console.log('Courses, units and topics ...');
const topicIds = new Map();      // "ci-ui-ti" -> topic_id
const courseIds = [];
for (const [ci, c] of courses.entries()) {
  const { course_id } = await one(
    `INSERT INTO courses (code, name, semester, credits) VALUES ($1, $2, $3, $4) RETURNING course_id`,
    [c.code, c.name, c.semester, c.credits]);
  courseIds.push(course_id);
  for (const [ui, u] of c.units.entries()) {
    const { unit_id } = await one(
      `INSERT INTO units (course_id, unit_no, title) VALUES ($1, $2, $3) RETURNING unit_id`, [course_id, ui + 1, u.title]);
    for (const [ti, t] of u.topics.entries()) {
      const { topic_id } = await one(`INSERT INTO topics (unit_id, name) VALUES ($1, $2) RETURNING topic_id`, [unit_id, t.name]);
      topicIds.set(`${ci}-${ui}-${ti}`, topic_id);
    }
  }
}
for (const fac of users.faculty) {
  for (const code of fac.courses) {
    await q(`INSERT INTO faculty_courses (faculty_id, course_id) SELECT $1, course_id FROM courses WHERE code = $2`,
      [facultyIds[fac.email], code]);
  }
}

// ---------- papers and questions ----------
console.log('Exam papers and questions ...');
const scope = { ISA1: [0, 1], ISA2: [2, 3], ESA: [0, 1, 2, 3] };
const perUnit = { ISA1: 3, ISA2: 3, ESA: 3 };
const family = new Map();         // question_id -> family key (ground truth)
const ordered = [];               // questions in chronological order
const usedFresh = new Set();      // one-off questions already used
for (const [ci, c] of courses.entries()) {
  const uploader = facultyIds[users.faculty.find((fa) => fa.courses.includes(c.code)).email];
  for (const year of years) {
    for (const type of ['ISA1', 'ISA2', 'ESA']) {
      const { paper_id } = await one(
        `INSERT INTO exam_papers (course_id, exam_type, exam_year, max_marks, duration_min, uploaded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING paper_id`,
        [courseIds[ci], type, year, type === 'ESA' ? 100 : 40, type === 'ESA' ? 180 : 90, uploader,
          `${year}-0${{ ISA1: 3, ISA2: 5, ESA: 7 }[type]}-15T10:00:00+05:30`]);

      for (const [qno, ui] of scope[type].entries()) {
        const unit = c.units[ui];
        const used = new Map();   // topic index -> families already used in this paper
        const topicOrder = shuffle(unit.topics.map((_, i) => i));
        for (let part = 0; part < perUnit[type]; part++) {
          const label = `${qno + 1}${'abcde'[part]}`;
          // about one slot in three gets a one-off question while the unit still has unused ones
          const freshLeft = (unit.fresh ?? []).map((_, k) => k).filter((k) => !usedFresh.has(`${ci}-${ui}-${k}`));
          if (freshLeft.length && rand() < 0.3) {
            const k = pick(freshLeft);
            usedFresh.add(`${ci}-${ui}-${k}`);
            const [fti, marks, body] = unit.fresh[k];
            const { question_id } = await one(
              `INSERT INTO questions (paper_id, q_label, topic_id, marks, body) VALUES ($1, $2, $3, $4, $5) RETURNING question_id`,
              [paper_id, label, topicIds.get(`${ci}-${ui}-${fti}`), marks, body]);
            family.set(question_id, `fresh-${ci}-${ui}-${k}`);
            ordered.push(question_id);
            continue;
          }
          let ti = topicOrder[part % topicOrder.length];
          if (!used.has(ti)) used.set(ti, new Set());
          let fi = pickFamily(unit.topics[ti].families, used.get(ti));
          if (fi < 0) {           // every family of this topic used: take another topic
            ti = topicOrder.find((t) => pickFamily(unit.topics[t].families, used.get(t) ?? new Set()) >= 0);
            if (ti === undefined) break;
            if (!used.has(ti)) used.set(ti, new Set());
            fi = pickFamily(unit.topics[ti].families, used.get(ti));
          }
          used.get(ti).add(fi);
          const fam = unit.topics[ti].families[fi];
          const { question_id } = await one(
            `INSERT INTO questions (paper_id, q_label, topic_id, marks, body) VALUES ($1, $2, $3, $4, $5) RETURNING question_id`,
            [paper_id, label, topicIds.get(`${ci}-${ui}-${ti}`), fam.marks, pick(fam.variants)]);
          family.set(question_id, `${ci}-${ui}-${ti}-${fi}`);
          ordered.push(question_id);
        }
      }
    }
  }
}

// ---------- embeddings (each UPDATE fires the repeat detector trigger) ----------
const { rows: qs } = await q(`SELECT question_id, body FROM questions ORDER BY question_id`);
const bodies = [...new Set(qs.map((r) => r.body))];
console.log(`Embedding ${bodies.length} distinct question texts (first run downloads the ~23 MB model) ...`);
const vectors = new Map();
for (let i = 0; i < bodies.length; i += 32) {
  const batch = bodies.slice(i, i + 32);
  (await embed(batch)).forEach((v, j) => vectors.set(batch[j], toPgVector(v)));
}
console.log('Storing embeddings and running repeat detection ...');
const bodyOf = new Map(qs.map((r) => [r.question_id, r.body]));
for (const id of ordered) {
  await q(`UPDATE questions SET embedding = $1 WHERE question_id = $2`, [vectors.get(bodyOf.get(id)), id]);
}

console.log('Publishing papers ...');
const { rows: papers } = await q(`SELECT paper_id FROM exam_papers ORDER BY exam_year, exam_type, course_id`);
for (const p of papers) await q(`CALL sp_publish_paper($1, $2)`, [p.paper_id, adminId]);

// ---------- detector evaluation against the ground truth (before any human review) ----------
const groupOf = new Map((await q(`SELECT question_id, group_id FROM questions`)).rows.map((r) => [r.question_id, r.group_id]));
const paperOf = new Map((await q(`SELECT question_id, paper_id FROM questions`)).rows.map((r) => [r.question_id, r.paper_id]));
const pending = new Set((await q(`SELECT q_low, q_high FROM repeat_candidates WHERE status = 'pending'`)).rows.map((r) => `${r.q_low}-${r.q_high}`));
const ids = [...family.keys()].sort((a, b) => a - b);
let tp = 0, fn = 0, fp = 0, reviewTrue = 0, reviewFalse = 0, autoTrue = 0;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    if (paperOf.get(a) === paperOf.get(b)) continue;
    const truth = family.get(a) === family.get(b);
    const grouped = groupOf.get(a) !== null && groupOf.get(a) === groupOf.get(b);
    const flagged = pending.has(`${a}-${b}`);
    if (grouped) truth ? (tp++, autoTrue++) : fp++;
    if (flagged) truth ? reviewTrue++ : reviewFalse++;
    if (truth && !grouped && !flagged) fn++;
  }
}
const truePairs = tp + fn + reviewTrue;
const pct = (x, y) => (y ? `${((100 * x) / y).toFixed(1)}%` : 'n/a');
const evaluation = [
  '# Repeat detector evaluation (seed data)',
  '',
  `Generated by \`npm run db:seed\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  'The seed knows which questions are rewordings of the same question (same family in `scripts/seed-data.mjs`),',
  'so the detector output can be checked against that ground truth. Pairs are counted across different papers of the same course.',
  '',
  '| Measure | Value |',
  '|---|---|',
  `| True repeat pairs in the data | ${truePairs} |`,
  `| Grouped automatically (similarity >= auto threshold) | ${tp + fp} |`,
  `| ...of which really repeats (auto-group precision) | ${tp} (${pct(tp, tp + fp)}) |`,
  `| Sent to faculty review (between thresholds) | ${reviewTrue + reviewFalse} |`,
  `| ...of which really repeats | ${reviewTrue} (${pct(reviewTrue, reviewTrue + reviewFalse)}) |`,
  `| Found either way (recall) | ${tp + reviewTrue} of ${truePairs} (${pct(tp + reviewTrue, truePairs)}) |`,
  `| Missed (similarity below review threshold) | ${fn} |`,
  '',
  'Missed pairs are rewordings that the small embedding model scores as less similar, for example',
  '"Explain 1NF, 2NF and 3NF" vs "describe the first, second and third normal forms". Topic-level statistics',
  '(`v_topic_frequency`) still count these, because both questions are tagged with the same topic.',
  '',
];
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/detection-evaluation.md', evaluation.join('\n'));

// ---------- earlier review decisions (papers up to 2023 were already reviewed by faculty) ----------
console.log('Recording faculty review decisions for 2021-2023 ...');
const { rows: oldPending } = await q(
  `SELECT rc.q_low, rc.q_high, c.course_id
   FROM repeat_candidates rc
   JOIN questions a ON a.question_id = rc.q_low  JOIN exam_papers pa ON pa.paper_id = a.paper_id
   JOIN questions b ON b.question_id = rc.q_high JOIN exam_papers pb ON pb.paper_id = b.paper_id
   JOIN courses c ON c.course_id = pa.course_id
   WHERE rc.status = 'pending' AND pa.exam_year <= 2023 AND pb.exam_year <= 2023
   ORDER BY rc.q_low, rc.q_high`);
for (const r of oldPending) {
  const reviewer = facultyIds[users.faculty.find((fa) => fa.courses.includes(courses[courseIds.indexOf(r.course_id)].code)).email];
  const decision = family.get(r.q_low) === family.get(r.q_high) ? 'confirmed' : 'rejected';
  await q('BEGIN');
  await q(`SELECT set_config('app.user_id', $1, true)`, [String(reviewer)]);
  const still = await one(`SELECT status FROM repeat_candidates WHERE q_low = $1 AND q_high = $2`, [r.q_low, r.q_high]);
  if (still?.status === 'pending') await q(`CALL sp_review_candidate($1, $2, $3, $4)`, [r.q_low, r.q_high, decision, reviewer]);
  await q('COMMIT');
}

// ---------- bookmarks for the demo student ----------
const { rows: hot } = await q(
  `SELECT q.question_id FROM v_hot_questions h
   JOIN LATERAL (SELECT question_id FROM questions WHERE group_id = h.group_id ORDER BY question_id DESC LIMIT 1) q ON TRUE
   WHERE h.course_id = $1 ORDER BY h.hot_rank LIMIT 4`, [courseIds[0]]);
for (const [i, h] of hot.entries()) {
  await q(`INSERT INTO bookmarks (student_id, question_id, note) VALUES ($1, $2, $3)`,
    [studentIds[0], h.question_id, i === 0 ? 'Asked almost every year: practise the diagram' : null]);
}

const s = await one(`SELECT
  (SELECT COUNT(*) FROM exam_papers)::int AS papers,
  (SELECT COUNT(*) FROM questions)::int AS questions,
  (SELECT COUNT(*) FROM repeat_groups)::int AS groups,
  (SELECT COUNT(*) FROM repeat_candidates WHERE status = 'pending')::int AS pending,
  (SELECT COUNT(*) FROM repeat_candidates WHERE status <> 'pending')::int AS reviewed`);
await client.end();
console.log(`\nDone: ${s.papers} papers, ${s.questions} questions, ${s.groups} repeat groups, ` +
  `${s.pending} pairs waiting for review, ${s.reviewed} already reviewed.`);
console.log(evaluation.slice(6, 14).join('\n'));
console.log('\nLogins: admin@pyqbank.test / Admin@123, faculty@pyqbank.test / Faculty@123, student@pyqbank.test / Student@123');
