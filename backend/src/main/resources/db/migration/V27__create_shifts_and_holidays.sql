-- business_rule_config already exists (created by an earlier, since-reverted migration
-- that is still applied on the shared database as of schema version 26 — see
-- standard_hours_per_day / updated_by / timestamptz columns). This migration only adds
-- the two Business Rules tables that are genuinely missing: shift timings and holidays.

CREATE TABLE shift_definition (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    start_time TIME         NOT NULL,
    end_time   TIME         NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

INSERT INTO shift_definition (name, start_time, end_time) VALUES
    ('General', '09:00:00', '18:00:00'),
    ('Early',   '07:00:00', '16:00:00');

CREATE TABLE holiday (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    holiday_date DATE         NOT NULL UNIQUE,
    created_at   TIMESTAMP    NOT NULL DEFAULT now()
);
