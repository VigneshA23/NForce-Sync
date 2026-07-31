-- Day Type split on the EOD entry (Working day / Leave / Holiday).
--
-- Numbered V35, NOT V33: the shared Neon DB is at V34 (V33 "add team lead dashboard
-- config" and V34 "add blocker age alert threshold" were applied from a working copy
-- whose .sql files were never committed). With validate-on-migrate: false, Flyway
-- silently SKIPS any file at or below the recorded version, and the app then dies at
-- boot with SchemaManagementException: missing column. See backend/CLAUDE.md.

-- Holiday is now a day-level type, so the combined category name no longer fits.
-- Renamed in place so category id 19 is preserved and every existing eod_task
-- foreign key stays valid — no rows are repointed.
UPDATE task_category SET name = 'Leave' WHERE name = 'Leave / Holiday';

-- Day-level classification. The DEFAULT backfills every existing entry as a working
-- day, which is what all of them were before this column existed.
ALTER TABLE eod_entry
    ADD COLUMN IF NOT EXISTS day_type VARCHAR(20) NOT NULL DEFAULT 'WORKING_DAY';
