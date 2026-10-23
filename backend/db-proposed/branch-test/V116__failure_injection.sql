-- NEON BRANCH TEST ONLY. A deliberately FAILING copy of V116. Never move this into db/migration and never
-- run it on the shared database. Delete the whole branch-test folder after the test.
--
-- Purpose: prove that when a later statement in a migration fails, Flyway rolls back the whole migration,
-- so the DROP INDEX below is undone and the old index is still there afterwards.
-- Expected: the migration FAILS at the third statement; idx_eod_clarification_open_per_entry still exists;
-- idx_eod_clarification_open_legacy_per_entry does not exist; no row 116 in flyway_schema_history.

DROP INDEX idx_eod_clarification_open_per_entry;

CREATE UNIQUE INDEX idx_eod_clarification_open_legacy_per_entry
    ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED' AND piece_id IS NULL;

-- Deliberate failure (division by zero):
SELECT 1 / 0;
