CREATE TABLE blocker_reply (
    id         BIGSERIAL PRIMARY KEY,
    task_id    BIGINT      NOT NULL REFERENCES eod_task(id),
    sender_id  BIGINT      NOT NULL REFERENCES app_user(id),
    message    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Thread lookup per blocker, oldest-first
CREATE INDEX idx_blocker_reply_task_created
    ON blocker_reply(task_id, created_at ASC);
