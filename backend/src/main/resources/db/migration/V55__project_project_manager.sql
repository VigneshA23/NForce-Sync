-- project.pm_id has been doing two jobs: naming the person who APPROVES EOD entries on the project
-- (surfaced in the UI as "Team Lead"), and scoping everything a PM oversees — their Approvals queue,
-- Project Dashboard, and the EOD-by-employee / Missing-EOD reports.
--
-- Since a PM may no longer be assigned as a project's Team Lead, pm_id can never hold a PM account,
-- which left every PM-scoped view permanently empty. Split the two roles: pm_id stays the Team Lead,
-- and project_manager_id names the overseeing PM.

ALTER TABLE project ADD COLUMN project_manager_id BIGINT REFERENCES app_user(id);

-- Backfill: the (single) active PM account owns everything that exists today. Falls back to the
-- project's current lead where no active PM exists, so a database seeded differently still ends up
-- with every row populated rather than failing the NOT NULL below.
UPDATE project
   SET project_manager_id = COALESCE(
        (SELECT u.id FROM app_user u
          WHERE u.role = 'PM' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          ORDER BY u.id LIMIT 1),
        pm_id
   );

ALTER TABLE project ALTER COLUMN project_manager_id SET NOT NULL;

-- Both PM-scoped lookups filter on this column, so index it.
CREATE INDEX idx_project_project_manager ON project (project_manager_id);
