-- V29: an allocation becomes a plain assignment — employee + project + date range.
--
-- Drops the Primary/Secondary distinction (added in V25) and the allocation percentage
-- (from V3). The approach built on top of them — Primary Project + Primary %, optional
-- Secondary Project + Secondary %, and a running Total Allocation % capped at 100 — is being
-- replaced by a different design, so the columns are removed rather than left dangling.
--
-- Postgres drops each column's CHECK constraint with the column itself, so
-- allocation_type_check (V25) and allocation_pct_check (V3) need no separate statement.
--
-- Consequence worth recording: the 100% ceiling enforced in AllocationService relied on
-- allocation_pct, so nothing now prevents the same employee being allocated to unlimited
-- overlapping projects, or to the same project twice. A unique employee+project guard over
-- overlapping date ranges is the natural replacement, but that is new behaviour and is
-- deliberately not introduced here.
--
-- Numbered 29 against a DB at V28. V21/V24/V27 were applied from another working copy and have
-- no .sql in this repo, so always confirm with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before adding a migration — Flyway silently skips files at/below the recorded version.

ALTER TABLE allocation DROP COLUMN IF EXISTS allocation_type;
ALTER TABLE allocation DROP COLUMN IF EXISTS allocation_pct;
