-- =====================================================================
-- 03_functions_triggers.sql
--   Functions, stored procedures and triggers, including the repeat detector.
--
--   How repeat detection works (all inside the database):
--     1. The app stores a question, then writes its 384-d embedding.
--     2. trg_detect_repeats fires (AFTER UPDATE OF embedding) and calls
--        fn_detect_repeats(question_id).
--     3. fn_detect_repeats finds the nearest questions of the SAME course in
--        OTHER papers using cosine distance (<=>) on the HNSW index:
--          similarity >= auto_threshold   -> grouped automatically (fn_link_questions)
--          review <= similarity < auto    -> stored in repeat_candidates for faculty review
--     4. Faculty confirm or reject candidates with sp_review_candidate.
-- =====================================================================

-- ---------- helper functions -----------------------------------------

-- Course that a question belongs to (question -> paper -> course)
CREATE OR REPLACE FUNCTION fn_question_course(p_question INT)
RETURNS INT LANGUAGE sql STABLE AS $$
    SELECT p.course_id
    FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
    WHERE q.question_id = p_question;
$$;

-- Cosine similarity (1 = identical meaning, 0 = unrelated) between two stored questions
CREATE OR REPLACE FUNCTION fn_similarity(p_a INT, p_b INT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT ROUND((1 - (a.embedding <=> b.embedding))::numeric, 4)
    FROM questions a, questions b
    WHERE a.question_id = p_a AND b.question_id = p_b;
$$;

-- TRUE if the user is an admin, or a faculty member assigned to the course
CREATE OR REPLACE FUNCTION fn_can_manage_course(p_user INT, p_course INT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM users WHERE user_id = p_user AND role = 'admin' AND is_active)
        OR EXISTS (SELECT 1 FROM faculty_courses fc JOIN users u ON u.user_id = fc.faculty_id
                   WHERE fc.faculty_id = p_user AND fc.course_id = p_course AND u.is_active);
$$;

-- ---------- fn_link_questions: put two questions in the same repeat group
--   neither grouped -> new group;  one grouped -> other joins it;
--   both in different groups -> groups are merged (lower group_id is kept).
CREATE OR REPLACE FUNCTION fn_link_questions(p_a INT, p_b INT, p_actor INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    ga INT; gb INT; keep_g INT; drop_g INT;
    ca INT := fn_question_course(p_a);
    cb INT := fn_question_course(p_b);
    first_body TEXT;
BEGIN
    IF ca IS NULL OR cb IS NULL THEN
        RAISE EXCEPTION 'Question not found';
    END IF;
    IF ca <> cb THEN
        RAISE EXCEPTION 'Questions from different courses cannot be repeats of each other';
    END IF;

    -- lock both rows so two reviewers cannot link the same questions at once
    SELECT group_id INTO ga FROM questions WHERE question_id = p_a FOR UPDATE;
    SELECT group_id INTO gb FROM questions WHERE question_id = p_b FOR UPDATE;

    IF ga IS NULL AND gb IS NULL THEN
        -- label the group with the text of the earliest appearance
        SELECT q.body INTO first_body
        FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
        WHERE q.question_id IN (p_a, p_b)
        ORDER BY p.exam_year, p.exam_type, q.question_id
        LIMIT 1;
        INSERT INTO repeat_groups (course_id, label, created_by)
        VALUES (ca, left(first_body, 117) || CASE WHEN length(first_body) > 117 THEN '...' ELSE '' END, p_actor)
        RETURNING group_id INTO keep_g;
        UPDATE questions SET group_id = keep_g WHERE question_id IN (p_a, p_b);
    ELSIF ga IS NULL THEN
        keep_g := gb;
        UPDATE questions SET group_id = keep_g WHERE question_id = p_a;
    ELSIF gb IS NULL OR ga = gb THEN
        keep_g := ga;
        UPDATE questions SET group_id = keep_g WHERE question_id = p_b;
    ELSE
        keep_g := LEAST(ga, gb);
        drop_g := GREATEST(ga, gb);
        UPDATE questions SET group_id = keep_g WHERE group_id = drop_g;
        DELETE FROM repeat_groups WHERE group_id = drop_g;
    END IF;

    -- pending suggestions between members of this group are now settled
    UPDATE repeat_candidates rc
    SET status = 'confirmed', reviewed_by = p_actor, reviewed_at = now()
    WHERE rc.status = 'pending'
      AND rc.q_low  IN (SELECT question_id FROM questions WHERE group_id = keep_g)
      AND rc.q_high IN (SELECT question_id FROM questions WHERE group_id = keep_g);

    RETURN keep_g;
END;
$$;

-- ---------- fn_detect_repeats: the repeat detector -------------------
-- Returns how many similar questions were found (grouped + sent for review).
CREATE OR REPLACE FUNCTION fn_detect_repeats(p_question INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v         vector(384);
    my_paper  INT;
    my_course INT;
    my_group  INT;
    cfg       detection_settings%ROWTYPE;
    r         RECORD;
    found_n   INT := 0;
BEGIN
    SELECT q.embedding, q.paper_id, p.course_id INTO v, my_paper, my_course
    FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
    WHERE q.question_id = p_question;
    IF v IS NULL THEN RETURN 0; END IF;

    SELECT * INTO cfg FROM detection_settings WHERE id = 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Detection settings are missing (detection_settings row id = 1)';
    END IF;

    FOR r IN
        SELECT q2.question_id, q2.group_id,
               ROUND((1 - (q2.embedding <=> v))::numeric, 4) AS sim
        FROM questions q2
        JOIN exam_papers p2 ON p2.paper_id = q2.paper_id
        WHERE p2.course_id = my_course
          AND q2.paper_id <> my_paper              -- a repeat must come from another paper
          AND q2.embedding IS NOT NULL
        ORDER BY q2.embedding <=> v                -- nearest first (uses the HNSW index)
        LIMIT 8
    LOOP
        EXIT WHEN r.sim < cfg.review_threshold;    -- results are sorted, so the rest are weaker

        SELECT group_id INTO my_group FROM questions WHERE question_id = p_question;
        CONTINUE WHEN my_group IS NOT NULL AND my_group = r.group_id;      -- already linked
        CONTINUE WHEN EXISTS (SELECT 1 FROM repeat_candidates             -- faculty said "not a repeat"
                              WHERE q_low = LEAST(p_question, r.question_id)
                                AND q_high = GREATEST(p_question, r.question_id)
                                AND status = 'rejected');
        found_n := found_n + 1;

        IF r.sim >= cfg.auto_threshold AND (my_group IS NULL OR r.group_id IS NULL) THEN
            PERFORM fn_link_questions(p_question, r.question_id, NULL);
        ELSE
            INSERT INTO repeat_candidates (q_low, q_high, similarity)
            VALUES (LEAST(p_question, r.question_id), GREATEST(p_question, r.question_id), r.sim)
            ON CONFLICT (q_low, q_high) DO NOTHING;
        END IF;
    END LOOP;
    RETURN found_n;
END;
$$;

-- ---------- STORED PROCEDURES (each runs as one transaction) ---------

-- Faculty decision on a suggested pair: 'confirmed' links them, 'rejected' remembers "not a repeat"
CREATE OR REPLACE PROCEDURE sp_review_candidate(
    p_low INT, p_high INT, p_decision candidate_status, p_reviewer INT)
LANGUAGE plpgsql AS $$
DECLARE
    c repeat_candidates%ROWTYPE;
BEGIN
    IF p_decision = 'pending' THEN
        RAISE EXCEPTION 'Decision must be confirmed or rejected';
    END IF;

    SELECT * INTO c FROM repeat_candidates
    WHERE q_low = p_low AND q_high = p_high
    FOR UPDATE;                                    -- row lock: no double review
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Suggested pair not found';
    END IF;
    IF c.status <> 'pending' THEN
        RAISE EXCEPTION 'This pair was already reviewed (%)', c.status;
    END IF;
    IF NOT fn_can_manage_course(p_reviewer, fn_question_course(p_low)) THEN
        RAISE EXCEPTION 'You are not assigned to this course';
    END IF;

    UPDATE repeat_candidates
    SET status = p_decision, reviewed_by = p_reviewer, reviewed_at = now()
    WHERE q_low = p_low AND q_high = p_high;

    IF p_decision = 'confirmed' THEN
        PERFORM fn_link_questions(p_low, p_high, p_reviewer);
    END IF;
END;
$$;

-- Remove a wrongly grouped question; the pairs are remembered as "rejected"
CREATE OR REPLACE PROCEDURE sp_ungroup_question(p_question INT, p_actor INT)
LANGUAGE plpgsql AS $$
DECLARE
    g INT;
BEGIN
    SELECT group_id INTO g FROM questions WHERE question_id = p_question FOR UPDATE;
    IF g IS NULL THEN
        RAISE EXCEPTION 'Question is not in a repeat group';
    END IF;
    IF NOT fn_can_manage_course(p_actor, fn_question_course(p_question)) THEN
        RAISE EXCEPTION 'You are not assigned to this course';
    END IF;

    INSERT INTO repeat_candidates (q_low, q_high, similarity, status, reviewed_by, reviewed_at)
    SELECT LEAST(p_question, q.question_id), GREATEST(p_question, q.question_id),
           GREATEST(COALESCE(fn_similarity(p_question, q.question_id), 0), 0), 'rejected', p_actor, now()
    FROM questions q
    WHERE q.group_id = g AND q.question_id <> p_question
    ON CONFLICT (q_low, q_high)
        DO UPDATE SET status = 'rejected', reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now();

    UPDATE questions SET group_id = NULL WHERE question_id = p_question;   -- trg_prune_groups tidies up
END;
$$;

-- Merge two repeat groups of the same course into p_keep
CREATE OR REPLACE PROCEDURE sp_merge_groups(p_keep INT, p_drop INT, p_actor INT)
LANGUAGE plpgsql AS $$
DECLARE
    ck INT; cd INT;
BEGIN
    IF p_keep = p_drop THEN
        RAISE EXCEPTION 'Choose two different groups';
    END IF;
    SELECT course_id INTO ck FROM repeat_groups WHERE group_id = p_keep FOR UPDATE;
    SELECT course_id INTO cd FROM repeat_groups WHERE group_id = p_drop FOR UPDATE;
    IF ck IS NULL OR cd IS NULL THEN
        RAISE EXCEPTION 'Group not found';
    END IF;
    IF ck <> cd THEN
        RAISE EXCEPTION 'Groups belong to different courses';
    END IF;
    IF NOT fn_can_manage_course(p_actor, ck) THEN
        RAISE EXCEPTION 'You are not assigned to this course';
    END IF;

    UPDATE questions SET group_id = p_keep WHERE group_id = p_drop;
    DELETE FROM repeat_groups WHERE group_id = p_drop;
END;
$$;

-- Publish a draft paper: it must have questions and every question must be embedded
CREATE OR REPLACE PROCEDURE sp_publish_paper(p_paper INT, p_actor INT)
LANGUAGE plpgsql AS $$
DECLARE
    pp exam_papers%ROWTYPE;
    n_total INT; n_missing INT;
BEGIN
    SELECT * INTO pp FROM exam_papers WHERE paper_id = p_paper FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paper not found';
    END IF;
    IF pp.status = 'published' THEN
        RAISE EXCEPTION 'Paper is already published';
    END IF;
    IF NOT fn_can_manage_course(p_actor, pp.course_id) THEN
        RAISE EXCEPTION 'You are not assigned to this course';
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE embedding IS NULL)
    INTO n_total, n_missing
    FROM questions WHERE paper_id = p_paper;

    IF n_total = 0 THEN
        RAISE EXCEPTION 'Add at least one question before publishing';
    END IF;
    IF n_missing > 0 THEN
        RAISE EXCEPTION '% question(s) have no embedding yet', n_missing;
    END IF;

    UPDATE exam_papers SET status = 'published' WHERE paper_id = p_paper;
END;
$$;

-- ---------- TRIGGERS -------------------------------------------------

-- (1) Question integrity: topic and group must belong to the paper's course;
--     a published paper is locked; editing the text clears the stale embedding.
CREATE OR REPLACE FUNCTION trg_fn_question_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    paper_course INT; topic_course INT; group_course INT;
    paper_state paper_status;
BEGIN
    SELECT course_id, status INTO paper_course, paper_state FROM exam_papers WHERE paper_id = NEW.paper_id;
    SELECT u.course_id INTO topic_course FROM topics t JOIN units u ON u.unit_id = t.unit_id
    WHERE t.topic_id = NEW.topic_id;

    IF topic_course IS DISTINCT FROM paper_course THEN
        RAISE EXCEPTION 'The topic does not belong to this paper''s course';
    END IF;

    IF NEW.group_id IS NOT NULL THEN
        SELECT course_id INTO group_course FROM repeat_groups WHERE group_id = NEW.group_id;
        IF group_course IS DISTINCT FROM paper_course THEN
            RAISE EXCEPTION 'A question can only join a repeat group of its own course';
        END IF;
    END IF;

    IF paper_state = 'published' AND (
         TG_OP = 'INSERT'
         OR NEW.body     IS DISTINCT FROM OLD.body
         OR NEW.marks    IS DISTINCT FROM OLD.marks
         OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
         OR NEW.q_label  IS DISTINCT FROM OLD.q_label
         OR NEW.paper_id IS DISTINCT FROM OLD.paper_id) THEN
        RAISE EXCEPTION 'This paper is published, so its questions can no longer be changed';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.body IS DISTINCT FROM OLD.body THEN
        NEW.embedding := NULL;            -- old vector no longer describes the text
        NEW.group_id  := NULL;            -- it must be detected again
        DELETE FROM repeat_candidates
        WHERE status = 'pending' AND (q_low = NEW.question_id OR q_high = NEW.question_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_question_integrity
BEFORE INSERT OR UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION trg_fn_question_integrity();

-- (2) Questions of a published paper cannot be deleted (cascade from deleting the paper is allowed)
CREATE OR REPLACE FUNCTION trg_fn_question_delete_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM exam_papers WHERE paper_id = OLD.paper_id AND status = 'published') THEN
        RAISE EXCEPTION 'This paper is published, so its questions can no longer be deleted';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_question_delete_guard
BEFORE DELETE ON questions
FOR EACH ROW EXECUTE FUNCTION trg_fn_question_delete_guard();

-- (3) THE REPEAT DETECTOR: runs whenever a question gets a (new) embedding
CREATE OR REPLACE FUNCTION trg_fn_detect_repeats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_detect_repeats(NEW.question_id);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_detect_repeats
AFTER INSERT OR UPDATE OF embedding ON questions
FOR EACH ROW WHEN (NEW.embedding IS NOT NULL)
EXECUTE FUNCTION trg_fn_detect_repeats();

-- (4) A repeat group with fewer than 2 questions is meaningless: delete it
CREATE OR REPLACE FUNCTION trg_fn_prune_groups()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.group_id IS NOT NULL
       AND (SELECT COUNT(*) FROM questions WHERE group_id = OLD.group_id) < 2 THEN
        DELETE FROM repeat_groups WHERE group_id = OLD.group_id;   -- FK sets the last member to NULL
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prune_groups
AFTER UPDATE OF group_id OR DELETE ON questions
FOR EACH ROW EXECUTE FUNCTION trg_fn_prune_groups();

-- (5) Paper status rules: published papers cannot go back to draft or change identity
CREATE OR REPLACE FUNCTION trg_fn_paper_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'published' AND (
         NEW.status    <> 'published'
         OR NEW.course_id <> OLD.course_id
         OR NEW.exam_type <> OLD.exam_type
         OR NEW.exam_year <> OLD.exam_year) THEN
        RAISE EXCEPTION 'A published paper cannot be unpublished or moved';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_paper_guard
BEFORE UPDATE ON exam_papers
FOR EACH ROW EXECUTE FUNCTION trg_fn_paper_guard();

-- (6) Only users with role 'faculty' can be assigned to courses
CREATE OR REPLACE FUNCTION trg_fn_faculty_role_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.faculty_id AND role = 'faculty') THEN
        RAISE EXCEPTION 'Only faculty accounts can be assigned to a course';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_faculty_role_check
BEFORE INSERT OR UPDATE ON faculty_courses
FOR EACH ROW EXECUTE FUNCTION trg_fn_faculty_role_check();

-- (7) Students can only bookmark questions from published papers
CREATE OR REPLACE FUNCTION trg_fn_bookmark_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM questions q JOIN exam_papers p ON p.paper_id = q.paper_id
                   WHERE q.question_id = NEW.question_id AND p.status = 'published') THEN
        RAISE EXCEPTION 'Only questions from published papers can be bookmarked';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookmark_check
BEFORE INSERT ON bookmarks
FOR EACH ROW EXECUTE FUNCTION trg_fn_bookmark_check();
