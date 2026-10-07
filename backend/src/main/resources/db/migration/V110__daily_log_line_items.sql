-- V110: Daily Log line items — scope flag on task_category, 12 management categories,
-- and eod_log_line table for PLAIN_LOG entry detail rows.
--
-- Numbered above V109 (add_escalation_to_eod_project_approval), confirmed as top version
-- on 2026-10-06. Run: SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
--
-- Name uniqueness change: drop the old global (name-only) unique index and replace it with
-- a per-scope index, so "Documentation" can exist as both an EMPLOYEE category and a
-- MANAGEMENT category without collision.

-- 1. Add scope column — DEFAULT 'EMPLOYEE' keeps all 19 existing rows unchanged.
ALTER TABLE task_category
    ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE'
    CONSTRAINT task_category_scope_check CHECK (scope IN ('EMPLOYEE','MANAGEMENT'));

-- 2. Drop the old global uniqueness index (was across all scopes).
DROP INDEX task_category_normalized_name_uq;

-- 3. Recreate uniqueness per scope: two scopes may share a name, but within one scope names
--    must be unique (case- and whitespace-normalized, matching the old rule within each scope).
CREATE UNIQUE INDEX task_category_scope_name_uq
    ON task_category (scope, lower(btrim(name)));

-- 4. Seed 12 management categories.
--    WHERE NOT EXISTS guards against re-runs (the unique index is the definitive guard).
INSERT INTO task_category (name, is_productive, is_billable_default, active, scope)
SELECT v.n, v.p, FALSE, TRUE, 'MANAGEMENT'
FROM (VALUES
    ('Meetings and Calls',               TRUE),
    ('Reviews and Approvals',            TRUE),
    ('Planning and Strategy',            TRUE),
    ('People and 1:1s',                  TRUE),
    ('Hiring and Interviews',            TRUE),
    ('Client and Stakeholder',           TRUE),
    ('Reporting and Analysis',           TRUE),
    ('Administration',                   TRUE),
    ('Escalations and Issue Resolution', TRUE),
    ('Documentation',                    TRUE),
    ('Training and Mentoring',           TRUE),
    ('Travel',                           FALSE)
) AS v(n, p)
WHERE NOT EXISTS (
    SELECT 1 FROM task_category t
    WHERE t.scope = 'MANAGEMENT' AND lower(btrim(t.name)) = lower(btrim(v.n))
);

-- 5. eod_log_line — one row per category line inside a PLAIN_LOG EOD entry.
--    Legacy PLAIN_LOG entries (before V110) have no rows here; the API returns logLines: []
--    and the frontend renders a single synthetic "Summary" row from log_summary/log_total_hours.
CREATE TABLE eod_log_line (
    id          BIGSERIAL    PRIMARY KEY,
    entry_id    BIGINT       NOT NULL REFERENCES eod_entry (id) ON DELETE CASCADE,
    category_id BIGINT       NOT NULL REFERENCES task_category (id),
    hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    description TEXT         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0
);

CREATE INDEX eod_log_line_entry_idx ON eod_log_line (entry_id);
