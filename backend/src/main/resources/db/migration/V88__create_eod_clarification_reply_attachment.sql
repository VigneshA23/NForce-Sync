-- Files/images attached to an EOD clarification reply — mirrors blocker_reply_attachment
-- (V47) exactly: same BYTEA storage (not the app_user.photo_data base64-in-TEXT shortcut,
-- which doesn't scale to multiple/larger non-image attachments), same on-demand download
-- endpoint rather than inlining bytes into the thread response.
CREATE TABLE eod_clarification_reply_attachment (
    id           BIGSERIAL PRIMARY KEY,
    reply_id     BIGINT      NOT NULL REFERENCES eod_clarification_reply(id),
    file_name    TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    file_size    BIGINT      NOT NULL,
    data         BYTEA       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eod_clarification_reply_attachment_reply
    ON eod_clarification_reply_attachment(reply_id);
