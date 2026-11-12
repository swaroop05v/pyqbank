// Fixed, read-only queries for the admin "SQL Lab" page (used in the demo / viva).
// Only these statements can run there, never user-typed SQL.

export type Showcase = { key: string; title: string; concepts: string[]; sql: string; setup?: string; note?: string };

export const showcases: Showcase[] = [
  {
    key: 'join',
    title: 'Every question with its paper, course, unit and topic',
    concepts: ['INNER JOIN (5 tables)', 'ORDER BY'],
    sql: `SELECT c.code, p.exam_type, p.exam_year, q.q_label, u.unit_no, t.name AS topic, q.marks,
       left(q.body, 60) AS question
FROM questions q
JOIN exam_papers p ON p.paper_id  = q.paper_id
JOIN courses c     ON c.course_id = p.course_id
JOIN topics t      ON t.topic_id  = q.topic_id
JOIN units u       ON u.unit_id   = t.unit_id
ORDER BY p.exam_year DESC, c.code, p.exam_type, q.q_label
LIMIT 40;`,
  },
  {
    key: 'aggregate',
    title: 'Questions and marks per course and exam type',
    concepts: ['GROUP BY', 'COUNT / SUM / AVG / MIN / MAX'],
    sql: `SELECT c.code, p.exam_type,
       COUNT(*)              AS questions,
       SUM(q.marks)          AS total_marks,
       ROUND(AVG(q.marks),2) AS avg_marks,
       MIN(q.marks)          AS min_marks,
       MAX(q.marks)          AS max_marks
FROM questions q
JOIN exam_papers p ON p.paper_id = q.paper_id
JOIN courses c     ON c.course_id = p.course_id
GROUP BY c.code, p.exam_type
ORDER BY c.code, p.exam_type;`,
  },
  {
    key: 'having',
    title: 'Topics examined in at least 4 different years',
    concepts: ['GROUP BY', 'HAVING', 'COUNT(DISTINCT)'],
    sql: `SELECT c.code, u.unit_no, t.name AS topic,
       COUNT(DISTINCT p.exam_year) AS years_asked,
       COUNT(*)                    AS times_asked
FROM questions q
JOIN exam_papers p ON p.paper_id  = q.paper_id
JOIN topics t      ON t.topic_id  = q.topic_id
JOIN units u       ON u.unit_id   = t.unit_id
JOIN courses c     ON c.course_id = u.course_id
GROUP BY c.code, u.unit_no, t.topic_id, t.name
HAVING COUNT(DISTINCT p.exam_year) >= 4
ORDER BY years_asked DESC, times_asked DESC;`,
  },
  {
    key: 'correlated',
    title: 'Questions worth more than the average question of their own paper',
    concepts: ['correlated subquery'],
    sql: `SELECT p.exam_type, p.exam_year, q.q_label, q.marks, left(q.body, 70) AS question
FROM questions q
JOIN exam_papers p ON p.paper_id = q.paper_id
WHERE q.marks > (SELECT AVG(q2.marks)
                 FROM questions q2
                 WHERE q2.paper_id = q.paper_id)   -- refers to the outer row
ORDER BY p.exam_year DESC, p.exam_type, q.q_label
LIMIT 30;`,
  },
  {
    key: 'notexists',
    title: 'Topics not asked in the last two years (2024 and 2025)',
    concepts: ['NOT EXISTS', 'nested subquery'],
    sql: `SELECT c.code, u.unit_no, t.name AS topic,
       (SELECT MAX(p.exam_year) FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
        WHERE q.topic_id = t.topic_id) AS last_asked
FROM topics t
JOIN units u   ON u.unit_id   = t.unit_id
JOIN courses c ON c.course_id = u.course_id
WHERE NOT EXISTS (
    SELECT 1 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
    WHERE q.topic_id = t.topic_id AND p.exam_year IN (2024, 2025))
ORDER BY c.code, u.unit_no;`,
  },
  {
    key: 'setops',
    title: 'Topics asked in 2024 but not in 2025, and topics asked in both',
    concepts: ['EXCEPT', 'INTERSECT', 'UNION ALL'],
    sql: `(SELECT 'only 2024' AS which, t.name AS topic
 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id JOIN topics t ON t.topic_id = q.topic_id
 WHERE p.exam_year = 2024
 EXCEPT
 SELECT 'only 2024', t.name
 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id JOIN topics t ON t.topic_id = q.topic_id
 WHERE p.exam_year = 2025)
UNION ALL
(SELECT 'both years', t.name
 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id JOIN topics t ON t.topic_id = q.topic_id
 WHERE p.exam_year = 2024
 INTERSECT
 SELECT 'both years', t.name
 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id JOIN topics t ON t.topic_id = q.topic_id
 WHERE p.exam_year = 2025)
ORDER BY which, topic;`,
  },
  {
    key: 'window',
    title: 'Repeat share of each paper, ranked within its course, with change from the previous paper of that type',
    concepts: ['window functions', 'RANK()', 'LAG()', 'PARTITION BY'],
    sql: `SELECT course_code, exam_type, exam_year,
       ROUND(100.0 * repeated_marks / NULLIF(marks_listed, 0), 1) AS repeat_pct,
       RANK() OVER (PARTITION BY course_code
                    ORDER BY repeated_marks / NULLIF(marks_listed, 0) DESC) AS rank_in_course,
       ROUND(100.0 * repeated_marks / NULLIF(marks_listed, 0), 1)
         - LAG(ROUND(100.0 * repeated_marks / NULLIF(marks_listed, 0), 1))
             OVER (PARTITION BY course_code, exam_type ORDER BY exam_year) AS change_vs_last
FROM v_paper_summary
WHERE status = 'published'
ORDER BY course_code, exam_type, exam_year;`,
  },
  {
    key: 'cte',
    title: 'How often each repeated question comes back (average gap in years)',
    concepts: ['CTE (WITH)', 'LAG()', 'AVG over gaps'],
    sql: `WITH appearances AS (
    SELECT q.group_id, p.exam_year,
           p.exam_year - LAG(p.exam_year) OVER (PARTITION BY q.group_id ORDER BY p.exam_year) AS gap
    FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
    WHERE q.group_id IS NOT NULL
),
gaps AS (
    SELECT group_id, COUNT(*) AS times, ROUND(AVG(gap), 2) AS avg_gap_years
    FROM appearances GROUP BY group_id
)
SELECT g.course_code, gaps.times, gaps.avg_gap_years, left(g.label, 70) AS question
FROM gaps JOIN v_repeat_groups g ON g.group_id = gaps.group_id
ORDER BY gaps.avg_gap_years NULLS LAST, gaps.times DESC
LIMIT 25;`,
  },
  {
    key: 'fts',
    title: 'Keyword search for "deadlock" (full-text search)',
    concepts: ['tsvector', 'websearch_to_tsquery', 'ts_rank', 'GIN index'],
    sql: `SELECT c.code, p.exam_type, p.exam_year, q.q_label,
       ROUND(ts_rank(q.body_tsv, query)::numeric, 3) AS rank,
       left(q.body, 80) AS question
FROM questions q
JOIN exam_papers p ON p.paper_id = q.paper_id
JOIN courses c ON c.course_id = p.course_id,
     websearch_to_tsquery('english', 'deadlock') AS query
WHERE q.body_tsv @@ query
ORDER BY rank DESC;`,
  },
  {
    key: 'vector',
    title: 'Most similar pairs of questions from different years (pgvector)',
    concepts: ['vector similarity', 'cosine distance <=>', 'self join', 'LATERAL'],
    sql: `SELECT c.code, pa.exam_year AS year_a, pb.exam_year AS year_b,
       ROUND((1 - (a.embedding <=> nn.embedding))::numeric, 3) AS similarity,
       left(a.body, 55) AS question_a, left(nn.body, 55) AS question_b
FROM questions a
JOIN exam_papers pa ON pa.paper_id = a.paper_id
                    AND pa.course_id = (SELECT course_id FROM courses WHERE code = 'UE23CS351A')
JOIN courses c ON c.course_id = pa.course_id
CROSS JOIN LATERAL (                       -- nearest question from a LATER year
    SELECT b.* FROM questions b JOIN exam_papers pb2 ON pb2.paper_id = b.paper_id
    WHERE pb2.course_id = pa.course_id AND pb2.exam_year > pa.exam_year AND b.body <> a.body
    ORDER BY b.embedding <=> a.embedding
    LIMIT 1) nn
JOIN exam_papers pb ON pb.paper_id = nn.paper_id
ORDER BY similarity DESC
LIMIT 15;`,
  },
  {
    key: 'view',
    title: 'Most likely questions (view v_hot_questions)',
    concepts: ['VIEW', 'window RANK()', 'CTE inside view'],
    sql: `SELECT course_code, hot_rank, heat_score, appearances, distinct_years, last_year, left(label, 70) AS question
FROM v_hot_questions
WHERE hot_rank <= 5
ORDER BY course_code, hot_rank;`,
  },
  {
    key: 'functions',
    title: 'Stored functions: similarity and permission checks',
    concepts: ['user-defined functions', 'fn_similarity', 'fn_can_manage_course'],
    sql: `SELECT rc.q_low, rc.q_high, rc.similarity AS stored,
       fn_similarity(rc.q_low, rc.q_high) AS recomputed,
       c.code AS course,
       fn_can_manage_course((SELECT user_id FROM users WHERE email = 'faculty@pyqbank.test'), c.course_id)    AS dbms_faculty_can_review,
       fn_can_manage_course((SELECT user_id FROM users WHERE email = 'os.faculty@pyqbank.test'), c.course_id) AS os_faculty_can_review
FROM repeat_candidates rc
JOIN courses c ON c.course_id = fn_question_course(rc.q_low)
WHERE rc.status = 'pending'
ORDER BY rc.similarity DESC
LIMIT 10;`,
  },
  {
    key: 'plan-small',
    title: 'Query plan: keyword search with default settings',
    concepts: ['EXPLAIN', 'query optimisation', 'cost-based planner'],
    note: 'With only a few hundred rows the planner estimates that reading the whole table is cheaper than using the GIN index, so it chooses a sequential scan. That is cost-based optimisation at work.',
    sql: `EXPLAIN
SELECT question_id FROM questions
WHERE body_tsv @@ websearch_to_tsquery('english', 'deadlock');`,
  },
  {
    key: 'plan-index',
    title: 'Query plan: same query with sequential scans discouraged',
    concepts: ['EXPLAIN', 'GIN index', 'Bitmap Index Scan'],
    setup: 'SET LOCAL enable_seqscan = off',
    note: 'Discouraging sequential scans (as if the table were large) makes the planner use the GIN index idx_questions_tsv.',
    sql: `EXPLAIN
SELECT question_id FROM questions
WHERE body_tsv @@ websearch_to_tsquery('english', 'deadlock');`,
  },
  {
    key: 'audit',
    title: 'Who changed what (audit trail by user and table)',
    concepts: ['LEFT JOIN', 'GROUP BY', 'JSONB'],
    sql: `SELECT COALESCE(u.full_name, 'system (detector / seed)') AS actor, a.table_name, a.operation,
       COUNT(*) AS changes, MAX(a.logged_at) AS last_change
FROM audit_log a LEFT JOIN users u ON u.user_id = a.actor_id
GROUP BY u.full_name, a.table_name, a.operation
ORDER BY changes DESC;`,
  },
];
