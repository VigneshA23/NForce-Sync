-- Replaces the plain resolved_at-only state with an explicit 3-value status, mirroring the shape
-- of Blockers' status dropdown (NEEDS_RESPONSE / ACKNOWLEDGED / RESOLVED) — see
-- EodClarification.Status. Unlike Blockers (which derives status from acknowledged_at/resolved_at
-- timestamps), this one is a real stored column: the status transitions are driven explicitly by
-- the Team Lead's dropdown, not inferred from reply activity.
ALTER TABLE eod_clarification
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'NEEDS_RESPONSE'
        CHECK (status IN ('NEEDS_RESPONSE', 'ACKNOWLEDGED', 'RESOLVED'));

-- Backfill: every round already marked resolved (resolved_at set) becomes status=RESOLVED.
-- resolved_at itself is untouched and keeps driving the "moves back to Approvals" transition —
-- only its trigger changes (now set only when status becomes RESOLVED, not standalone).
UPDATE eod_clarification SET status = 'RESOLVED' WHERE resolved_at IS NOT NULL;

DROP INDEX idx_eod_clarification_open_per_entry;
CREATE UNIQUE INDEX idx_eod_clarification_open_per_entry
    ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED';
