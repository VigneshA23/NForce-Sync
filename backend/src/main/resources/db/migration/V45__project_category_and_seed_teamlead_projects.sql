-- V45: creates project_category for the Team Lead "My Projects" module, and seeds dev/test
-- project assignments for the Team Lead test account.
--
-- NOTE ON VERSIONING: per backend/CLAUDE.md, the live DB has previously run ahead of the
-- migration files committed to this repo (uncommitted local migrations applied directly). A
-- prior attempt at this table was originally committed as V41, but that version number turned
-- out to already be occupied in the live `flyway_schema_history` by unrelated, uncommitted
-- content — with `validate-on-migrate: false` (see application.yml), Flyway silently treats an
-- already-recorded version as done and never runs the local file's SQL, regardless of content.
-- That V41 file has been removed; project_category is created fresh here under version 45,
-- confirmed ahead of the live schema's observed high-water mark of 44. Confirm
-- `flyway_schema_history` before deploying if the live schema has moved further since.
CREATE TABLE project_category (
    id          BIGSERIAL    PRIMARY KEY,
    -- Optional: a category is generic master data owned by its creator (the Team Lead), not a
    -- required sub-resource of one project — see TeamLeadProjectService. It may still be tagged
    -- to a project the creator is assigned to when that's useful.
    project_id  BIGINT       NULL REFERENCES project (id),
    name        VARCHAR(150) NOT NULL,
    code        VARCHAR(50)  NULL,
    description VARCHAR(500) NULL,
    color       VARCHAR(20)  NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                CONSTRAINT project_category_status_check
                CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_by  BIGINT       NOT NULL REFERENCES app_user (id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Scoped to creator, not project: a Team Lead cannot have two categories with the same name.
    CONSTRAINT project_category_created_by_name_uq UNIQUE (created_by, name)
);

CREATE INDEX idx_project_category_project_id ON project_category (project_id);
CREATE INDEX idx_project_category_created_by ON project_category (created_by);

-- Dev/test seed data: assign 3 existing projects to the seeded Team Lead test account
-- (teamlead@nforceone.com) so "My Projects" has real data to display in local/dev
-- environments. Reuses the existing Allocation mechanism — no new tables. Guarded by
-- NOT EXISTS + a project-code lookup (rather than hardcoded ids) so this is a no-op if the
-- account, the named projects, or the allocations themselves don't exist in a given environment.
INSERT INTO allocation (employee_id, project_id, allocation_pct, effective_from, effective_to, created_at)
SELECT u.id, p.id, 100, CURRENT_DATE, NULL, NOW()
FROM app_user u
CROSS JOIN project p
WHERE u.email = 'teamlead@nforceone.com'
  AND p.code IN ('NORDIC-RETAIL', 'INTERNAL-TOOLS', 'SYNC')
  AND NOT EXISTS (
      SELECT 1 FROM allocation a
      WHERE a.employee_id = u.id AND a.project_id = p.id
  );
