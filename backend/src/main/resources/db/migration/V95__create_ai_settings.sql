-- Singleton, Super-Admin-editable operational settings for the AI assistant. "singleton BOOLEAN
-- CHECK(singleton) + UNIQUE(singleton)" is the standard trick to make Postgres refuse a second row.

CREATE TABLE ai_rate_limit_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    requests_per_window INTEGER NOT NULL DEFAULT 60,
    window_minutes INTEGER NOT NULL DEFAULT 60,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_rate_limit_singleton CHECK (singleton),
    CONSTRAINT uq_ai_rate_limit_singleton UNIQUE (singleton),
    CONSTRAINT chk_ai_rate_limit_requests CHECK (requests_per_window > 0 AND requests_per_window <= 1000),
    CONSTRAINT chk_ai_rate_limit_window CHECK (window_minutes > 0 AND window_minutes <= 1440)
);
INSERT INTO ai_rate_limit_settings (enabled, requests_per_window, window_minutes)
VALUES (TRUE, 60, 60)
ON CONFLICT (singleton) DO NOTHING;

-- monthly_budget_usd / *_cost_per_million_usd seed values reflect Mistral's published pricing as
-- of 2026-09-24 (mistral.ai/pricing/api): Ministral 8B (the configured chat-model) $0.15 / $0.15
-- per million input/output tokens, mistral-embed $0.10 per million tokens. These are
-- Super-Admin-editable and must be re-verified against Mistral's current pricing page whenever
-- the configured chat-model or embed-model changes, or periodically -- the billing endpoint
-- clearly marks its output as an internal estimate, never the provider's actual invoice.
CREATE TABLE ai_billing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton BOOLEAN NOT NULL DEFAULT TRUE,
    monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    prompt_cost_per_million_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.15,
    completion_cost_per_million_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.15,
    embedding_cost_per_million_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ai_billing_singleton CHECK (singleton),
    CONSTRAINT uq_ai_billing_singleton UNIQUE (singleton),
    CONSTRAINT chk_ai_billing_budget CHECK (monthly_budget_usd >= 0),
    CONSTRAINT chk_ai_billing_prompt_cost CHECK (prompt_cost_per_million_usd >= 0),
    CONSTRAINT chk_ai_billing_completion_cost CHECK (completion_cost_per_million_usd >= 0),
    CONSTRAINT chk_ai_billing_embedding_cost CHECK (embedding_cost_per_million_usd >= 0)
);
INSERT INTO ai_billing_settings (monthly_budget_usd, prompt_cost_per_million_usd, completion_cost_per_million_usd, embedding_cost_per_million_usd)
VALUES (50.00, 0.15, 0.15, 0.10)
ON CONFLICT (singleton) DO NOTHING;
