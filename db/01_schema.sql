-- =====================================================================
-- PYQ Bank : Previous-Year Question Bank with Repeat Detection
-- 01_schema.sql  -- DDL: DROP / CREATE / ALTER, keys and constraints
-- Target: PostgreSQL 15+ with the pgvector extension
-- =====================================================================

-- ---------- DROP (makes the script re-runnable) ----------------------
DROP VIEW  IF EXISTS v_question_detail, v_repeat_groups, v_unit_weightage, v_topic_frequency,
                     v_hot_questions, v_paper_summary CASCADE;
DROP TABLE IF EXISTS audit_log, bookmarks, repeat_candidates, questions, repeat_groups,
                     exam_papers, faculty_courses, topics, units, courses, students,
                     detection_settings, users CASCADE;
DROP TYPE  IF EXISTS user_role, exam_type, paper_status, candidate_status CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: vector(n) type and the <=> operator

-- ---------- ENUM types (domain integrity) ----------------------------
CREATE TYPE user_role        AS ENUM ('admin', 'faculty', 'student');
CREATE TYPE exam_type        AS ENUM ('ISA1', 'ISA2', 'ESA');
CREATE TYPE paper_status     AS ENUM ('draft', 'published');
CREATE TYPE candidate_status AS ENUM ('pending', 'confirmed', 'rejected');

-- ---------- USERS (login + role) -------------------------------------
CREATE TABLE users (
    user_id        SERIAL       PRIMARY KEY,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,
    full_name      VARCHAR(80)  NOT NULL,
    role           user_role    NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_email_lower  CHECK (email = lower(email)),
    CONSTRAINT chk_name_len     CHECK (char_length(trim(full_name)) >= 2)
);

-- ---------- STUDENTS (1:1 specialisation of users) -------------------
CREATE TABLE students (
    student_id  INT          PRIMARY KEY,              -- same value as users.user_id
    srn         VARCHAR(13)  NOT NULL UNIQUE,
    semester    SMALLINT     NOT NULL,
    CONSTRAINT chk_srn      CHECK (srn ~ '^PES[12]UG[0-9]{2}[A-Z]{2}[0-9]{3}$'),
    CONSTRAINT chk_semester CHECK (semester BETWEEN 1 AND 8)
);

-- ---------- COURSES > UNITS > TOPICS (syllabus hierarchy) ------------
CREATE TABLE courses (
    course_id  SERIAL       PRIMARY KEY,
    code       VARCHAR(12)  NOT NULL UNIQUE,
    name       VARCHAR(80)  NOT NULL,
    semester   SMALLINT     NOT NULL,
    credits    SMALLINT     NOT NULL DEFAULT 4,
    CONSTRAINT chk_course_code CHECK (code ~ '^UE[0-9]{2}[A-Z]{2}[0-9]{3}[A-Z]?$'),
    CONSTRAINT chk_course_sem  CHECK (semester BETWEEN 1 AND 8),
    CONSTRAINT chk_credits     CHECK (credits BETWEEN 1 AND 6)
);

CREATE TABLE units (
    unit_id    SERIAL       PRIMARY KEY,
    course_id  INT          NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    unit_no    SMALLINT     NOT NULL,
    title      VARCHAR(100) NOT NULL,
    CONSTRAINT chk_unit_no   CHECK (unit_no BETWEEN 1 AND 5),
    CONSTRAINT uq_unit_no    UNIQUE (course_id, unit_no)
);

CREATE TABLE topics (
    topic_id  SERIAL       PRIMARY KEY,
    unit_id   INT          NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
    name      VARCHAR(100) NOT NULL,
    CONSTRAINT uq_topic_name UNIQUE (unit_id, name)
);

-- ---------- FACULTY <-> COURSES (M:N: who may upload papers) ---------
CREATE TABLE faculty_courses (
    faculty_id  INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    course_id   INT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    PRIMARY KEY (faculty_id, course_id)
);

-- ---------- EXAM PAPERS ----------------------------------------------
CREATE TABLE exam_papers (
    paper_id     SERIAL        PRIMARY KEY,
    course_id    INT           NOT NULL REFERENCES courses(course_id) ON DELETE RESTRICT,
    exam_type    exam_type     NOT NULL,
    exam_year    SMALLINT      NOT NULL,
    max_marks    SMALLINT      NOT NULL,
    status       paper_status  NOT NULL DEFAULT 'draft',
    uploaded_by  INT           REFERENCES users(user_id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_exam_year  CHECK (exam_year BETWEEN 2015 AND 2035),
    CONSTRAINT chk_max_marks  CHECK (max_marks BETWEEN 10 AND 100),
    CONSTRAINT uq_paper       UNIQUE (course_id, exam_type, exam_year)
);

-- ---------- REPEAT GROUPS (a set of questions judged to be the same) --
CREATE TABLE repeat_groups (
    group_id    SERIAL        PRIMARY KEY,
    course_id   INT           NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    label       VARCHAR(120)  NOT NULL,
    created_by  INT           REFERENCES users(user_id) ON DELETE SET NULL,   -- NULL = created by the detector
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------- QUESTIONS ------------------------------------------------
CREATE TABLE questions (
    question_id  SERIAL        PRIMARY KEY,
    paper_id     INT           NOT NULL,
    q_label      VARCHAR(4)    NOT NULL,                  -- e.g. 1a, 2b, 3
    topic_id     INT           NOT NULL,
    marks        NUMERIC(4,1)  NOT NULL,
    body         TEXT          NOT NULL,
    embedding    vector(384),                            -- semantic vector of the question text
    body_tsv     tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
    group_id     INT,                                    -- repeat group, NULL = not (yet) a repeat
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_q_label   CHECK (q_label ~ '^[1-9][0-9]?[a-e]?$'),
    CONSTRAINT chk_marks     CHECK (marks > 0 AND marks <= 20),
    CONSTRAINT chk_body_len  CHECK (char_length(trim(body)) >= 10),
    CONSTRAINT uq_q_label    UNIQUE (paper_id, q_label)
);

-- ---------- REPEAT CANDIDATES (detector suggestions for faculty review)
-- The pair is stored once, smaller id first (q_low < q_high).
CREATE TABLE repeat_candidates (
    q_low        INT               NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    q_high       INT               NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    similarity   NUMERIC(5,4)      NOT NULL,
    status       candidate_status  NOT NULL DEFAULT 'pending',
    detected_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
    reviewed_by  INT               REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    PRIMARY KEY (q_low, q_high),
    CONSTRAINT chk_pair_order  CHECK (q_low < q_high),
    CONSTRAINT chk_similarity  CHECK (similarity BETWEEN 0 AND 1),
    CONSTRAINT chk_reviewed    CHECK ((status = 'pending') = (reviewed_at IS NULL))
);

-- ---------- BOOKMARKS (student practice list) ------------------------
CREATE TABLE bookmarks (
    student_id   INT           NOT NULL REFERENCES students(student_id)   ON DELETE CASCADE,
    question_id  INT           NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    note         VARCHAR(200),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, question_id)
);

-- ---------- DETECTION SETTINGS (single-row table) --------------------
CREATE TABLE detection_settings (
    id                SMALLINT      PRIMARY KEY DEFAULT 1,
    auto_threshold    NUMERIC(4,3)  NOT NULL,     -- similarity at or above this: grouped automatically
    review_threshold  NUMERIC(4,3)  NOT NULL,     -- between review and auto: sent to faculty review
    updated_by        INT           REFERENCES users(user_id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_single_row  CHECK (id = 1),
    CONSTRAINT chk_thresholds  CHECK (review_threshold > 0 AND review_threshold < auto_threshold AND auto_threshold <= 1)
);

-- ---------- AUDIT LOG (filled only by triggers) ----------------------
CREATE TABLE audit_log (
    log_id      BIGSERIAL    PRIMARY KEY,
    table_name  VARCHAR(40)  NOT NULL,
    operation   VARCHAR(6)   NOT NULL,
    row_pk      TEXT,
    actor_id    INT,
    old_data    JSONB,
    new_data    JSONB,
    logged_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- ALTER TABLE: foreign keys added after creation -----------
-- (kept separate to demonstrate ALTER; questions <-> repeat_groups etc.)
ALTER TABLE students
    ADD CONSTRAINT fk_students_user FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE questions
    ADD CONSTRAINT fk_questions_paper FOREIGN KEY (paper_id) REFERENCES exam_papers(paper_id)  ON DELETE CASCADE,
    ADD CONSTRAINT fk_questions_topic FOREIGN KEY (topic_id) REFERENCES topics(topic_id)       ON DELETE RESTRICT,
    ADD CONSTRAINT fk_questions_group FOREIGN KEY (group_id) REFERENCES repeat_groups(group_id) ON DELETE SET NULL;

-- ALTER: add a column after the fact, with its own constraint
ALTER TABLE exam_papers ADD COLUMN duration_min SMALLINT NOT NULL DEFAULT 90;
ALTER TABLE exam_papers ADD CONSTRAINT chk_duration CHECK (duration_min BETWEEN 30 AND 240);
