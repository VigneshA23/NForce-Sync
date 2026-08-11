-- V51: promote project type to an admin-managed Organization Master (like billing_model in V49).
--
-- WHY FLAGS, NOT JUST A NAME: project_type gated two rules through the literal string 'CLIENT' --
--   * ProjectService.resolveClient    -- only a CLIENT project stores/requires a client name
--   * ProjectDto.billableAllowed      -- called by EodService, which forces is_billable=false
--                                        when the project does not qualify
-- Making the list admin-editable would mean a rename of 'Client' silently turned every project
-- non-billable. So each type carries explicit requires_client / billable_allowed booleans and the
-- code keys off those instead of a magic string.
--
-- Seeded with only the two types actually in use (CLIENT x4, INTERNAL x4). The old CHECK also
-- permitted PRODUCT_DEVELOPMENT / SUPPORT / BENCH, but the UI never offered them and no row uses
-- them, so they are deliberately left out -- a Super Admin can add them if wanted.
--
-- Numbered 51 against a DB at V50; local files have gaps because migrations have been applied from
-- other working copies. Always confirm with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before adding one -- Flyway silently skips files at/below the recorded version.

CREATE TABLE project_type (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL UNIQUE,
    -- Drives "Client Name is required" on the project form and in ProjectService.
    requires_client  BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Drives whether EOD time on such a project may be flagged billable.
    billable_allowed BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP    NOT NULL DEFAULT now()
);

INSERT INTO project_type (name, requires_client, billable_allowed) VALUES
    ('Client',   TRUE,  TRUE),
    ('Internal', FALSE, FALSE);

ALTER TABLE project ADD COLUMN project_type_id BIGINT REFERENCES project_type(id);

UPDATE project p SET project_type_id = t.id
  FROM project_type t
 WHERE (p.project_type = 'CLIENT'   AND t.name = 'Client')
    OR (p.project_type = 'INTERNAL' AND t.name = 'Internal');

-- The old column is NOT NULL and carries project_type_check (V26, widened in V40); dropping the
-- column takes its CHECK with it. SET NOT NULL runs last and will abort the migration if any row
-- failed to map above -- that is the intended safety net.
ALTER TABLE project DROP COLUMN project_type;
ALTER TABLE project ALTER COLUMN project_type_id SET NOT NULL;
