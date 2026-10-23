-- READ-ONLY verification, to run AFTER V115 has been applied. SELECT statements only; changes nothing.
-- Expected numbers are from the 2026-10-19 dry run. Rounds created after that add to "rounds"; a round the OLD
-- backend creates after V115 has piece_id NULL (it does not know the column) and shows up in check 3.

-- 1. V115 recorded as successful (expect one row, success = true).
SELECT version, description, success FROM flyway_schema_history WHERE version = '115';

-- 2. Totals. Dry run: 11 rounds, 10 mapped, 1 null.
SELECT count(*) AS rounds, count(piece_id) AS mapped, count(*) - count(piece_id) AS null_piece
FROM eod_clarification;

-- 3. The rounds still NULL. Expect only round 31 (entry 2357, opened_by 160), plus any legacy round created later.
SELECT id, eod_entry_id, opened_by_id, status FROM eod_clarification WHERE piece_id IS NULL ORDER BY id;

-- 4. The four sample rounds. Expect 28 -> 2551, 29 -> 2615, 30 -> 2606, 35 -> 2620.
SELECT id, piece_id FROM eod_clarification WHERE id IN (28, 29, 30, 35) ORDER BY id;

-- 5. Every mapped round must point at a piece of its own entry. Expect zero rows.
SELECT c.id, c.eod_entry_id, p.eod_entry_id AS piece_entry
FROM eod_clarification c
JOIN eod_project_approval p ON p.id = c.piece_id
WHERE p.eod_entry_id <> c.eod_entry_id;

-- 6. Indexes on the table. Expect the OLD idx_eod_clarification_open_per_entry to still be present, plus the two
--    new ones idx_eod_clarification_piece and idx_eod_clarification_open_per_piece.
SELECT indexname FROM pg_indexes WHERE tablename = 'eod_clarification' ORDER BY indexname;

-- 7. Open rounds per entry. Expect at most 1 per entry while the old index is still in place (V116 not applied).
SELECT eod_entry_id, count(*) AS open_rounds
FROM eod_clarification WHERE status <> 'RESOLVED'
GROUP BY eod_entry_id HAVING count(*) > 1;
