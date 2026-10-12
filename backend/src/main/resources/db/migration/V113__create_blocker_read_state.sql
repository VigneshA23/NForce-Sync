-- Per (blocker, viewing user): when that user last read the blocker's reply thread. Backs the unread
-- badge on the employee-side "My Blockers" item (reviewer replies newer than last_read_at are unread).
-- Same shape as eod_clarification_read_state (V89): one row per user per blocker, upserted on open.
CREATE TABLE blocker_read_state (
    id           BIGSERIAL PRIMARY KEY,
    task_id      BIGINT      NOT NULL REFERENCES eod_task(id) ON DELETE CASCADE,
    user_id      BIGINT      NOT NULL REFERENCES app_user(id),
    last_read_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_blocker_read_state UNIQUE (task_id, user_id)
);

CREATE INDEX idx_blocker_read_state_user ON blocker_read_state(user_id);
