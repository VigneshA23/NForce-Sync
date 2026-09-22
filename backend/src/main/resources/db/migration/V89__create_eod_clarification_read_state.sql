-- Per-(clarification round, viewing user) read tracking for the EOD Inbox unread/bold indicator.
-- One row per user per round; last_read_at is compared against the round's latest message
-- created_at (see EodClarificationService#computeUnread) to decide unread, mirroring how
-- notification "read" state already works elsewhere in this app but scoped to a conversation
-- thread instead of a single notification row.
CREATE TABLE eod_clarification_read_state (
    id               BIGSERIAL PRIMARY KEY,
    clarification_id BIGINT      NOT NULL REFERENCES eod_clarification(id),
    user_id          BIGINT      NOT NULL REFERENCES app_user(id),
    last_read_at     TIMESTAMPTZ NOT NULL,
    UNIQUE (clarification_id, user_id)
);

CREATE INDEX idx_eod_clarification_read_state_user ON eod_clarification_read_state(user_id);
