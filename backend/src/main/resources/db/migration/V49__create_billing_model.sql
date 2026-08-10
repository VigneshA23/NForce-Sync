-- V49: promote the project billing model to an admin-managed Organization Master.
--
-- It was a hardcoded <select> in the PM Project form writing a free-text VARCHAR(50) with no CHECK,
-- so nobody owned the list and the API accepted any string. It now lives beside department /
-- designation / location, maintained by a Super Admin, and project references it by FK exactly as
-- app_user references those three.
--
-- Table shape deliberately mirrors V14 (is_active, created_at/updated_at) so the entity, DTO and
-- service can follow the existing Department code.
--
-- Numbered 49 against a DB at V48. Local migration files have gaps (V41-V43, V45-V47 were applied
-- from other working copies), so always confirm with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before adding one -- Flyway silently skips files at/below the recorded version.

CREATE TABLE billing_model (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

-- The five options the hardcoded dropdown offered, so the Project form behaves as it did before.
INSERT INTO billing_model (name) VALUES
    ('Billable'),
    ('T & M'),
    ('Fixed Bid'),
    ('Internal'),
    ('Non-Billable');

ALTER TABLE project ADD COLUMN billing_model_id BIGINT REFERENCES billing_model(id);

-- Map the old enum-ish strings onto the seeded rows. Live data at migration time was
-- T_AND_M x3, FIXED_BID x2 and NULL x2; nulls stay null since the field remains optional.
UPDATE project p SET billing_model_id = b.id
  FROM billing_model b
 WHERE (p.billing_model = 'T_AND_M'      AND b.name = 'T & M')
    OR (p.billing_model = 'FIXED_BID'    AND b.name = 'Fixed Bid')
    OR (p.billing_model = 'BILLABLE'     AND b.name = 'Billable')
    OR (p.billing_model = 'INTERNAL'     AND b.name = 'Internal')
    OR (p.billing_model = 'NON_BILLABLE' AND b.name = 'Non-Billable');

ALTER TABLE project DROP COLUMN billing_model;
