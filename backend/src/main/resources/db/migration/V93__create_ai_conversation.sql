-- Conversation storage for the AI support assistant. Owner-scoped by app_user.id; repository
-- methods only ever look these rows up WHERE user_id = :callerId, so a foreign or unknown
-- conversation id can never expose another user's transcript.
CREATE TABLE ai_conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conversation_user ON ai_conversation (user_id, last_message_at DESC);

-- "clear" (POST /conversations/{id}/clear) deletes rows from this table but keeps the
-- ai_conversation row itself, so the active tab's conversation id stays valid.
CREATE TABLE ai_conversation_message (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
    sender VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    response_type VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_conversation_message_sender CHECK (sender IN ('USER', 'ASSISTANT'))
);
CREATE INDEX idx_ai_conversation_message_conv ON ai_conversation_message (conversation_id, created_at DESC);
