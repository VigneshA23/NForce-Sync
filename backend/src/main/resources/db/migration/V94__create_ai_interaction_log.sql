-- Server-side interaction telemetry: one row per turn, answering "what was the assistant working
-- from when it said that" -- never the question/answer text itself, which lives only in
-- ai_conversation_message (see ai_conversation_message.content). Privacy: only question_chars
-- (an int) is stored here, not the question.
CREATE TABLE ai_interaction_log (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES ai_conversation(id) ON DELETE SET NULL,
    assistant_message_id BIGINT REFERENCES ai_conversation_message(id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    current_page_id VARCHAR(60),
    response_type VARCHAR(20),
    confidence VARCHAR(10),
    navigation_page_id VARCHAR(60),
    retrieved_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    retrieved_count INTEGER NOT NULL DEFAULT 0,
    top_score DOUBLE PRECISION,
    -- Which live-data providers ran (ids only, never the data they returned) -- improvement over
    -- OneHR, where provider selection was debug-log-only and unrecoverable after the fact.
    live_data_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
    provider VARCHAR(30),
    model VARCHAR(60),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    embedding_prompt_tokens INTEGER,
    api_call_attempts INTEGER NOT NULL DEFAULT 1,
    latency_ms INTEGER,
    success BOOLEAN NOT NULL,
    -- DISABLED | EMPTY_MESSAGE | MESSAGE_TOO_LONG | RATE_LIMITED | INACTIVE_USER | NO_KNOWLEDGE |
    -- RETRIEVAL_UNAVAILABLE | PROVIDER_UNAVAILABLE | MALFORMED_OUTPUT | UNKNOWN_ANSWER
    error_code VARCHAR(40),
    question_chars INTEGER NOT NULL,
    feedback_rating VARCHAR(4),
    feedback_comment TEXT,
    feedback_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_interaction_log_feedback CHECK (feedback_rating IS NULL OR feedback_rating IN ('UP', 'DOWN'))
);

CREATE INDEX idx_ai_interaction_log_created ON ai_interaction_log (created_at DESC);
CREATE INDEX idx_ai_interaction_log_response_type ON ai_interaction_log (response_type, created_at DESC);
CREATE INDEX idx_ai_interaction_log_user ON ai_interaction_log (user_id, created_at DESC);
CREATE INDEX idx_ai_interaction_log_conversation ON ai_interaction_log (conversation_id, created_at DESC);
