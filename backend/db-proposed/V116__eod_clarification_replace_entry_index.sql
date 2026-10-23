-- PROPOSED — NOT in src/main/resources/db/migration on purpose. Apply ONLY after V115 is applied and its
-- backfill report has been reviewed.
--
-- Step 2 of 2: allow one open round per piece (two leads can each have a round open on the same EOD).
-- The per-entry rule is kept only for legacy rows that have no piece.
--
-- Compatibility note: after this runs, a database can hold two open rounds on one entry. The OLD backend's
-- findByEodEntryIdAndStatusNot (an Optional) would throw on such an entry. ORDER: V115, then deploy the
-- new backend everywhere that uses this database, THEN this file. Flyway runs it as one transaction.

DROP INDEX idx_eod_clarification_open_per_entry;

CREATE UNIQUE INDEX idx_eod_clarification_open_legacy_per_entry
    ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED' AND piece_id IS NULL;
