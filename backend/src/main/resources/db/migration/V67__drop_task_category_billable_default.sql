-- Part of the Billable/Non-Billable classification removal (see plan in the assistant session
-- that authored V67-V72). Verify against
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before applying — local migration files may not be authoritative for the shared Neon DB
-- (backend/CLAUDE.md: "the DB is AHEAD of this repo").
--
-- is_billable_default was write-only: TeamLeadProjectService.createCategory set it but nothing
-- ever read it. Dropping it is purely additive — no other column or business rule depends on it.

ALTER TABLE task_category DROP COLUMN is_billable_default;
