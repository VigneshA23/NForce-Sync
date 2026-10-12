-- Numbered after V111, the highest file in this repo. CLAUDE.md warns the live database can be ahead
-- of the files here (other working copies apply migrations whose files never land) — re-verify with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before applying; Flyway silently skips a file at or below the recorded version.
--
-- Whether the employee actually worked on a WEEKEND day. Only meaningful when day_type = 'WEEKEND':
--   false -> a no-work weekend: no tasks, zero hours, nothing for anyone to approve.
--   true  -> weekend work: tasks are required and every logged hour is overtime (applyOvertime).
-- Schema only. Existing rows all get false; EodService treats a weekend entry that already carries
-- tasks/log lines as worked regardless of this flag, so old data keeps validating until the
-- separate backfill runs.
ALTER TABLE eod_entry
    ADD COLUMN weekend_worked BOOLEAN NOT NULL DEFAULT FALSE;
