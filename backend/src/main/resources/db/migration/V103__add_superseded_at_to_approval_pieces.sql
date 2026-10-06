-- Marks pieces from a previous submission cycle as historical so they are never surfaced
-- in the pending queue or in an employee's current-status view, while preserving their
-- action records (who acted, when, with what comment) for the full audit trail.
--
-- Convention matches app_user.deleted_at: null = current, non-null = superseded at that timestamp.
ALTER TABLE eod_project_approval
    ADD COLUMN superseded_at TIMESTAMPTZ NULL;

CREATE INDEX idx_eod_project_approval_superseded_at
    ON eod_project_approval (superseded_at)
    WHERE superseded_at IS NULL;
