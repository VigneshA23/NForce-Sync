-- V118 — Status + Blocker on the Daily Log (PLAIN_LOG) line items.            PROPOSED — NOT APPLIED.
--
-- Daily Log users (employee on the bench, PM/Admin with no active project) get the same per-line Status as
-- Submit EOD (Completed / In Progress / Blocked / Not Started). A Blocked line is a blocker routed to the
-- user's reporting manager. A blocker on Submit EOD is an eod_task row; a Daily Log line is not a task, so the
-- blocker fields live on eod_log_line itself and the reply thread / read state may point at either.
--
-- Before applying: confirm the top version —
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;   -- expected 117
-- and that this file is copied to src/main/resources/db/migration ONLY after review.
--
-- Old rows: every new column is NULLable and nothing is backfilled. A line with no status simply has none;
-- the app requires one only when a line is SUBMITTED (drafts may leave it empty).
-- Flyway note: no placeholder-style dollar-brace text appears in this file, even in comments.
--
-- WHAT THIS FILE CONTAINS (and nothing else) — no DROP TABLE / DROP COLUMN, no UPDATE / INSERT / DELETE:
--   * 6 nullable columns on eod_log_line, 1 nullable column each on blocker_reply and blocker_read_state
--   * foreign keys on the three new reference columns (all NULL at creation, so nothing to validate against)
--   * CHECK eod_log_line_task_status_check: task_status is NULL or one of COMPLETED / IN_PROGRESS / BLOCKED / NOT_STARTED
--   * CHECK blocker_reply_one_target / blocker_read_state_one_target: exactly one of task_id / log_line_id is set
--   * 2 x "ALTER COLUMN task_id DROP NOT NULL" — a constraint RELAXATION, not a drop of data. It is required so a
--     Daily Log reply (task_id NULL, log_line_id set) can exist; the one-of CHECK above replaces the NOT NULL.
--   * UNIQUE (log_line_id, user_id) on blocker_read_state, and 2 indexes (one partial, on BLOCKED lines)
--
-- EXISTING DATA: every existing blocker_reply / blocker_read_state row has task_id set and log_line_id NULL, so it
-- satisfies "exactly one is set" (dev DB check before applying: 6 replies, 1 read-state row, 0 with task_id NULL).
-- Existing eod_log_line rows get NULL in every new column, which the status CHECK allows. No constraint name or
-- index name used here exists yet. Tables are tiny (eod_log_line 17 rows), so the CHECK scans and the plain
-- CREATE INDEX take effectively no time; ADD COLUMN without a default is metadata-only on PostgreSQL.
-- Flyway runs the whole file in one transaction on PostgreSQL, so a failure leaves nothing half-applied.
--
-- ROLLBACK (manual — Flyway has no automatic undo; keep this block for the day it is needed). Safe ONLY while no
-- Daily Log blocker has been replied to or read: run it in this order, in one transaction —
--   ALTER TABLE blocker_read_state DROP CONSTRAINT uq_blocker_read_state_line,
--                                  DROP CONSTRAINT blocker_read_state_one_target,
--                                  DROP COLUMN log_line_id;
--   ALTER TABLE blocker_read_state ALTER COLUMN task_id SET NOT NULL;   -- fails if a log-line row still exists
--   DROP INDEX idx_blocker_reply_log_line_created;
--   ALTER TABLE blocker_reply DROP CONSTRAINT blocker_reply_one_target, DROP COLUMN log_line_id;
--   ALTER TABLE blocker_reply ALTER COLUMN task_id SET NOT NULL;        -- fails if a log-line reply still exists
--   DROP INDEX eod_log_line_blocked_idx;
--   ALTER TABLE eod_log_line DROP CONSTRAINT eod_log_line_task_status_check,
--       DROP COLUMN task_status, DROP COLUMN blocker_reason, DROP COLUMN acknowledged_at,
--       DROP COLUMN acknowledged_by_id, DROP COLUMN resolved_at, DROP COLUMN resolved_by_id;
--   DELETE FROM flyway_schema_history WHERE version = '118';
-- If Daily Log blockers already exist, deleting them is data loss — restore from a Neon point-in-time branch instead.
-- Roll the application back to the previous build first; the old code does not know these columns but ignores them.

-- 1. The line carries its own status, blocker reason and the same Acknowledge / Resolve markers an eod_task has.
ALTER TABLE eod_log_line
    ADD COLUMN task_status        VARCHAR(30),
    ADD COLUMN blocker_reason     TEXT,
    ADD COLUMN acknowledged_at    TIMESTAMPTZ,
    ADD COLUMN acknowledged_by_id BIGINT REFERENCES app_user (id),
    ADD COLUMN resolved_at        TIMESTAMPTZ,
    ADD COLUMN resolved_by_id     BIGINT REFERENCES app_user (id);

ALTER TABLE eod_log_line
    ADD CONSTRAINT eod_log_line_task_status_check
        CHECK (task_status IS NULL OR task_status IN ('COMPLETED', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED'));

-- The Reporting Manager's Blockers query: open (BLOCKED) lines, by status.
CREATE INDEX eod_log_line_blocked_idx ON eod_log_line (entry_id) WHERE task_status = 'BLOCKED';

-- 2. A reply thread belongs to exactly one blocker: an eod_task (Submit EOD) or an eod_log_line (Daily Log).
ALTER TABLE blocker_reply
    ALTER COLUMN task_id DROP NOT NULL,
    ADD COLUMN log_line_id BIGINT REFERENCES eod_log_line (id);

ALTER TABLE blocker_reply
    ADD CONSTRAINT blocker_reply_one_target CHECK (num_nonnulls(task_id, log_line_id) = 1);

CREATE INDEX idx_blocker_reply_log_line_created ON blocker_reply (log_line_id, created_at);

-- 3. Same for the per-user read state behind the My Blockers unread badge.
ALTER TABLE blocker_read_state
    ALTER COLUMN task_id DROP NOT NULL,
    ADD COLUMN log_line_id BIGINT REFERENCES eod_log_line (id) ON DELETE CASCADE;

ALTER TABLE blocker_read_state
    ADD CONSTRAINT blocker_read_state_one_target CHECK (num_nonnulls(task_id, log_line_id) = 1),
    ADD CONSTRAINT uq_blocker_read_state_line UNIQUE (log_line_id, user_id);
