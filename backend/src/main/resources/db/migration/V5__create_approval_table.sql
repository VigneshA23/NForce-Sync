-- V5: Approval action table for EOD workflow

CREATE TABLE approval_action (
    id               BIGSERIAL    PRIMARY KEY,
    eod_entry_id     BIGINT       NOT NULL REFERENCES eod_entry (id),
    actor_id         BIGINT       NOT NULL REFERENCES app_user (id),
    action           VARCHAR(30)  NOT NULL
                     CONSTRAINT approval_action_check
                     CHECK (action IN ('APPROVE','REJECT','REQUEST_CHANGES')),
    comment          TEXT         NULL,
    billable_override BOOLEAN     NULL,
    acted_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_action_entry ON approval_action (eod_entry_id);
CREATE INDEX idx_approval_action_actor ON approval_action (actor_id);
