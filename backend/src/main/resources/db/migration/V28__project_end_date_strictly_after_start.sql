-- V28: an end date must fall strictly AFTER the start date.
--
-- V26 allowed end_date = start_date; a project may not begin and end on the same day, so the
-- comparison is tightened to '>'. Safe to apply: 0 existing rows have end_date = start_date.
--
-- Numbered 28 because V27 ("create shifts and holidays") was applied to the shared DB from
-- another working copy and has no .sql file in this repo. Always check
-- `SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;` before
-- adding a migration — Flyway silently skips files at/below the recorded version.

ALTER TABLE project DROP CONSTRAINT IF EXISTS project_date_order_chk;

ALTER TABLE project
    ADD CONSTRAINT project_date_order_chk
    CHECK (end_date IS NULL OR end_date > start_date);

-- Deliberately NOT enforcing "COMPLETED implies an end date" as a CHECK: project id 3
-- ('INTERNAL-TOOLS') is already COMPLETED with a null end_date, so the constraint could not be
-- applied without editing data. ProjectService.update enforces it for every edit instead.
