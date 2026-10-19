-- V115: per-piece EOD clarification rounds.
--
-- Step 1 of 2 (additive, backward compatible): a clarification round becomes tied to the opener's own
-- approval piece (one piece = one project + one lead). Nothing existing is dropped or altered, so the
-- currently deployed backend keeps working: it ignores the new column and never writes it.
--
-- The old per-entry unique index (idx_eod_clarification_open_per_entry) is KEPT here; it is replaced in
-- V116 only after the backfill below has been verified.

ALTER TABLE eod_clarification
    ADD COLUMN piece_id BIGINT NULL REFERENCES eod_project_approval(id);

CREATE INDEX idx_eod_clarification_piece ON eod_clarification(piece_id);

-- At most one open round per piece. Legacy rows (piece_id NULL) are not covered by this index and keep
-- the old per-entry rule.
CREATE UNIQUE INDEX idx_eod_clarification_open_per_piece
    ON eod_clarification(piece_id) WHERE status <> 'RESOLVED' AND piece_id IS NOT NULL;

-- Backfill: map a round to the CURRENT-cycle piece its opener holds (as approver or escalated-to) on the
-- same entry — but only when that is unambiguous (exactly one such piece). A round whose opener holds
-- several current pieces on the entry (a lead of two projects on one EOD), or none (e.g. a superseded
-- cycle), keeps piece_id NULL: a "legacy" round that only its opener (and the employee) can use, and that
-- blocks only the pending pieces its opener still holds.
WITH candidates AS (
    SELECT c.id AS clarification_id,
           p.id AS piece_id,
           COUNT(*) OVER (PARTITION BY c.id) AS n
    FROM eod_clarification c
    JOIN eod_project_approval p
      ON p.eod_entry_id = c.eod_entry_id
     AND p.superseded_at IS NULL
     AND (p.approver_id = c.opened_by_id OR p.escalated_to_id = c.opened_by_id)
    WHERE c.piece_id IS NULL
)
UPDATE eod_clarification c
SET piece_id = candidates.piece_id
FROM candidates
WHERE candidates.clarification_id = c.id
  AND candidates.n = 1;
