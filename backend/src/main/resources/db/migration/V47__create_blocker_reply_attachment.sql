-- Files/images attached to a blocker reply. Stored as BYTEA rather than following the
-- app_user.photo_data base64-in-TEXT shortcut — that pattern embeds the file directly in
-- every profile fetch response, which doesn't scale to multiple, larger, non-image
-- attachments on a chat-style thread. Attachments are fetched on demand via a dedicated
-- download endpoint instead of being inlined into the reply/thread response.
CREATE TABLE blocker_reply_attachment (
    id           BIGSERIAL PRIMARY KEY,
    reply_id     BIGINT      NOT NULL REFERENCES blocker_reply(id),
    file_name    TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    file_size    BIGINT      NOT NULL,
    data         BYTEA       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Batch metadata lookup for a page of replies (thread load), and per-attachment download.
CREATE INDEX idx_blocker_reply_attachment_reply
    ON blocker_reply_attachment(reply_id);
