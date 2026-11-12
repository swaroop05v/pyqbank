-- =====================================================================
-- 02_indexes.sql  -- B-tree, composite, partial, GIN (full-text) and HNSW (vector)
-- =====================================================================

-- B-tree indexes on foreign keys that are joined / filtered on often
CREATE INDEX idx_units_course          ON units (course_id);
CREATE INDEX idx_topics_unit           ON topics (unit_id);
CREATE INDEX idx_questions_paper       ON questions (paper_id);
CREATE INDEX idx_questions_topic       ON questions (topic_id);
CREATE INDEX idx_faculty_courses_course ON faculty_courses (course_id);
CREATE INDEX idx_groups_course         ON repeat_groups (course_id);
CREATE INDEX idx_audit_table_time      ON audit_log (table_name, logged_at DESC);

-- Composite index: "papers of a course, newest first" (course page, upload checks)
CREATE INDEX idx_papers_course_year    ON exam_papers (course_id, exam_year DESC, exam_type);

-- Partial indexes: only the rows these queries ever look at
CREATE INDEX idx_questions_grouped     ON questions (group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_candidates_pending    ON repeat_candidates (detected_at) WHERE status = 'pending';
CREATE INDEX idx_candidates_high       ON repeat_candidates (q_high);   -- PK covers q_low lookups

-- GIN index for full-text (keyword) search on question text
CREATE INDEX idx_questions_tsv         ON questions USING GIN (body_tsv);

-- HNSW index: approximate nearest-neighbour search with cosine distance (<=>)
CREATE INDEX idx_questions_embedding   ON questions USING hnsw (embedding vector_cosine_ops);
