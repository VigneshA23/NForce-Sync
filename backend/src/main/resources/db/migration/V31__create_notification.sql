CREATE TABLE notification (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT        NOT NULL REFERENCES app_user(id),
    type       VARCHAR(50)   NOT NULL,
    title      VARCHAR(200)  NOT NULL,
    message    TEXT,
    link       VARCHAR(500),
    is_read    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Fast unread-count query per user
CREATE INDEX idx_notification_user_unread
    ON notification(user_id, is_read)
    WHERE is_read = FALSE;

-- Paginated timeline per user
CREATE INDEX idx_notification_user_created
    ON notification(user_id, created_at DESC);
