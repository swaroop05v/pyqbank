-- =====================================================================
-- 04_views.sql  -- reporting views (only PUBLISHED papers count in statistics)
-- =====================================================================

-- One row per question with everything needed to display it (5-table JOIN)
CREATE OR REPLACE VIEW v_question_detail AS
SELECT q.question_id, q.q_label, q.marks, q.body, q.group_id,
       q.paper_id, p.exam_type, p.exam_year, p.status AS paper_status,
       c.course_id, c.code AS course_code, c.name AS course_name,
       u.unit_id, u.unit_no, u.title AS unit_title,
       t.topic_id, t.name AS topic,
       (q.embedding IS NOT NULL) AS has_embedding,
       gs.group_size
FROM questions q
JOIN exam_papers p ON p.paper_id  = q.paper_id
JOIN courses c     ON c.course_id = p.course_id
JOIN topics t      ON t.topic_id  = q.topic_id
JOIN units u       ON u.unit_id   = t.unit_id
LEFT JOIN (SELECT group_id, COUNT(*) AS group_size
           FROM questions WHERE group_id IS NOT NULL
           GROUP BY group_id) gs ON gs.group_id = q.group_id;

-- Each repeat group: how often and when it was asked (GROUP BY + HAVING + string_agg)
CREATE OR REPLACE VIEW v_repeat_groups AS
SELECT g.group_id, g.course_id, c.code AS course_code, g.label,
       MIN(u.unit_no)                                       AS unit_no,
       (array_agg(t.name ORDER BY p.exam_year, p.exam_type))[1] AS topic,
       COUNT(*)                                             AS appearances,
       COUNT(DISTINCT p.exam_year)                          AS distinct_years,
       MIN(p.exam_year)                                     AS first_year,
       MAX(p.exam_year)                                     AS last_year,
       string_agg(p.exam_type || ' ' || p.exam_year || ' Q' || q.q_label, ', '
                  ORDER BY p.exam_year, p.exam_type)        AS asked_in,
       ROUND(AVG(q.marks), 1)                               AS avg_marks
FROM repeat_groups g
JOIN courses c     ON c.course_id = g.course_id
JOIN questions q   ON q.group_id  = g.group_id
JOIN exam_papers p ON p.paper_id  = q.paper_id AND p.status = 'published'
JOIN topics t      ON t.topic_id  = q.topic_id
JOIN units u       ON u.unit_id   = t.unit_id
GROUP BY g.group_id, g.course_id, c.code, g.label
HAVING COUNT(*) >= 2;

-- "Most likely to be asked": repeat groups ranked per course (CTE + window function)
--   heat_score = number of different years asked + 1 bonus if asked in the latest or previous year
CREATE OR REPLACE VIEW v_hot_questions AS
WITH latest AS (
    SELECT course_id, MAX(exam_year) AS latest_year
    FROM exam_papers WHERE status = 'published'
    GROUP BY course_id
)
SELECT rg.*,
       l.latest_year - rg.last_year AS years_since_last,
       rg.distinct_years + CASE WHEN l.latest_year - rg.last_year <= 1 THEN 1 ELSE 0 END AS heat_score,
       RANK() OVER (PARTITION BY rg.course_id
                    ORDER BY rg.distinct_years + CASE WHEN l.latest_year - rg.last_year <= 1 THEN 1 ELSE 0 END DESC,
                             rg.appearances DESC) AS hot_rank
FROM v_repeat_groups rg
JOIN latest l ON l.course_id = rg.course_id;

-- Marks weightage of each unit across all published papers (window SUM over the course)
CREATE OR REPLACE VIEW v_unit_weightage AS
SELECT c.course_id, c.code AS course_code, u.unit_id, u.unit_no, u.title,
       COUNT(q.question_id)            AS questions,
       COALESCE(SUM(q.marks), 0)       AS total_marks,
       ROUND(100.0 * COALESCE(SUM(q.marks), 0)
             / NULLIF(SUM(SUM(q.marks)) OVER (PARTITION BY c.course_id), 0), 1) AS pct_marks,
       COUNT(DISTINCT q.paper_id)      AS papers
FROM courses c
JOIN units u  ON u.course_id = c.course_id
JOIN topics t ON t.unit_id   = u.unit_id
LEFT JOIN (questions q JOIN exam_papers p ON p.paper_id = q.paper_id AND p.status = 'published')
       ON q.topic_id = t.topic_id
GROUP BY c.course_id, c.code, u.unit_id, u.unit_no, u.title;

-- How often each topic is examined (the "same topic asked again" kind of repeat)
CREATE OR REPLACE VIEW v_topic_frequency AS
SELECT c.course_id, u.unit_no, t.topic_id, t.name AS topic,
       COUNT(q.question_id)          AS times_asked,
       COUNT(DISTINCT p.exam_year)   AS years_asked,
       MAX(p.exam_year)              AS last_asked,
       COALESCE(SUM(q.marks), 0)     AS total_marks,
       COUNT(q.group_id)             AS repeated_questions
FROM courses c
JOIN units u  ON u.course_id = c.course_id
JOIN topics t ON t.unit_id   = u.unit_id
LEFT JOIN (questions q JOIN exam_papers p ON p.paper_id = q.paper_id AND p.status = 'published')
       ON q.topic_id = t.topic_id
GROUP BY c.course_id, u.unit_no, t.topic_id, t.name;

-- Per paper: how much of it was repeated from EARLIER papers (correlated subquery in FILTER)
CREATE OR REPLACE VIEW v_paper_summary AS
SELECT p.paper_id, p.course_id, c.code AS course_code, p.exam_type, p.exam_year, p.status,
       p.max_marks, p.uploaded_by,
       COUNT(q.question_id)       AS questions,
       COALESCE(SUM(q.marks), 0)  AS marks_listed,
       COUNT(q.question_id) FILTER (WHERE EXISTS (
           SELECT 1 FROM questions q2 JOIN exam_papers p2 ON p2.paper_id = q2.paper_id
           WHERE q2.group_id = q.group_id
             AND p2.status = 'published'
             AND (p2.exam_year, p2.exam_type) < (p.exam_year, p.exam_type))) AS repeated_questions,
       COALESCE(SUM(q.marks) FILTER (WHERE EXISTS (
           SELECT 1 FROM questions q2 JOIN exam_papers p2 ON p2.paper_id = q2.paper_id
           WHERE q2.group_id = q.group_id
             AND p2.status = 'published'
             AND (p2.exam_year, p2.exam_type) < (p.exam_year, p.exam_type))), 0) AS repeated_marks
FROM exam_papers p
JOIN courses c ON c.course_id = p.course_id
LEFT JOIN questions q ON q.paper_id = p.paper_id
GROUP BY p.paper_id, c.code;
