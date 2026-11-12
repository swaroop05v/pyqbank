-- =====================================================================
-- 05_audit.sql  -- audit trail: who changed what, written only by triggers
--
-- The app runs every change inside a transaction and first calls
--     SELECT set_config('app.user_id', '<id>', true)
-- ('true' = the setting lasts only for this transaction). The trigger reads it back.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_current_actor()
RETURNS INT LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::INT;
$$;

-- Generic audit trigger. TG_ARGV lists the primary-key column(s) of the table.
-- Large columns (embedding vector, tsvector) are left out of the snapshot.
CREATE OR REPLACE FUNCTION trg_fn_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    old_j JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) - 'embedding' - 'body_tsv' END;
    new_j JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) - 'embedding' - 'body_tsv' END;
    pk    TEXT  := '';
    i     INT;
BEGIN
    IF TG_OP = 'UPDATE' AND old_j = new_j THEN
        RETURN NULL;                       -- only the vector changed: nothing worth logging
    END IF;
    FOR i IN 0 .. TG_NARGS - 1 LOOP
        pk := pk || CASE WHEN i > 0 THEN ',' ELSE '' END || (COALESCE(new_j, old_j) ->> TG_ARGV[i]);
    END LOOP;
    INSERT INTO audit_log (table_name, operation, row_pk, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, pk, fn_current_actor(), old_j, new_j);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_papers     AFTER INSERT OR UPDATE OR DELETE ON exam_papers
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('paper_id');
CREATE TRIGGER trg_audit_questions  AFTER INSERT OR UPDATE OR DELETE ON questions
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('question_id');
CREATE TRIGGER trg_audit_candidates AFTER INSERT OR UPDATE OR DELETE ON repeat_candidates
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('q_low', 'q_high');
CREATE TRIGGER trg_audit_groups     AFTER INSERT OR DELETE ON repeat_groups
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('group_id');
CREATE TRIGGER trg_audit_settings   AFTER UPDATE ON detection_settings
    FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('id');

-- Default thresholds, calibrated on the seed questions with all-MiniLM-L6-v2:
--   rewordings of the same question: median similarity 0.80
--   different questions of the same unit: at most 0.73
-- Admins can tune them on the Settings page.
INSERT INTO detection_settings (id, auto_threshold, review_threshold) VALUES (1, 0.800, 0.600);
