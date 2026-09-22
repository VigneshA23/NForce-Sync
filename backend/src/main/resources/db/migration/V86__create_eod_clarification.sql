-- EOD Clarification Workflow: a two-way conversation a Team Lead opens against an employee's
-- SUBMITTED EOD entry from the Approvals detail popup. Unlike Blockers (single thread per
-- EodTask, resolved once, forever terminal), a clarification can be opened, resolved, and later
-- opened again on the same entry — so it's modeled as discrete "rounds" (eod_clarification
-- header rows) rather than a status column or a flag directly on eod_entry. eod_entry.status
-- itself is never touched by this feature (stays SUBMITTED throughout) — see V44's removal of
-- CHANGES_REQUESTED for why a new entry-status value was deliberately avoided here too.
CREATE TABLE eod_clarification (
    id             BIGSERIAL PRIMARY KEY,
    eod_entry_id   BIGINT      NOT NULL REFERENCES eod_entry(id),
    opened_by_id   BIGINT      NOT NULL REFERENCES app_user(id),
    opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at    TIMESTAMPTZ,
    resolved_by_id BIGINT REFERENCES app_user(id)
);

-- Enforces "at most one open round per entry" at the DB level, and doubles as the index the
-- "exclude from Approvals while open" query needs.
CREATE UNIQUE INDEX idx_eod_clarification_open_per_entry
    ON eod_clarification(eod_entry_id) WHERE resolved_at IS NULL;

CREATE INDEX idx_eod_clarification_entry ON eod_clarification(eod_entry_id);

-- Message thread, scoped to one round — mirrors blocker_reply's shape exactly (V41), just
-- parented to a clarification round instead of a blocked task.
CREATE TABLE eod_clarification_reply (
    id               BIGSERIAL PRIMARY KEY,
    clarification_id BIGINT      NOT NULL REFERENCES eod_clarification(id),
    sender_id        BIGINT      NOT NULL REFERENCES app_user(id),
    message          TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eod_clarification_reply_thread ON eod_clarification_reply(clarification_id, created_at ASC);
