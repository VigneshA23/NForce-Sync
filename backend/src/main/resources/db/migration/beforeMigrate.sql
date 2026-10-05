-- Flyway SQL callback — runs before any versioned migration.
-- Creates business_rule_config if it does not exist so fresh databases
-- (V1 onward) don't fail on the first migration that references the table.
-- This is a no-op on Neon and any DB that already has the table.
--
-- Column set matches the pre-V33 baseline (no FK on updated_by — app_user does not
-- exist yet when this callback runs, so the FK must be omitted here). V33+ migrations
-- add the FK and any later columns idempotently via ALTER TABLE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS business_rule_config (
    id                     BIGINT       NOT NULL DEFAULT 1,
    standard_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8.00,
    weekend_rule           VARCHAR(20)  NOT NULL DEFAULT 'SAT_SUN',
    eod_cutoff_time        TIME         NOT NULL DEFAULT '19:00:00',
    reminder_lead_minutes  INTEGER      NOT NULL DEFAULT 120,
    escalation_sla_hours   INTEGER      NOT NULL DEFAULT 48,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by             BIGINT       NULL,
    CONSTRAINT business_rule_config_pkey     PRIMARY KEY (id),
    CONSTRAINT business_rule_config_singleton CHECK (id = 1),
    CONSTRAINT business_rule_hours_check     CHECK (standard_hours_per_day > 0 AND standard_hours_per_day <= 24),
    CONSTRAINT business_rule_reminder_check  CHECK (reminder_lead_minutes >= 0),
    CONSTRAINT business_rule_sla_check       CHECK (escalation_sla_hours > 0),
    CONSTRAINT business_rule_weekend_check   CHECK (weekend_rule IN ('SAT_SUN', 'SUN_ONLY'))
);

INSERT INTO business_rule_config (id) VALUES (1) ON CONFLICT DO NOTHING;
