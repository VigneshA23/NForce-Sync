-- V50: bridge Team Lead "Category Management" (project_category) with the Employee EOD
-- Categories dropdown (task_category), per business rule: a category a Team Lead creates must
-- be visible to every employee on their team (app_user.manager_id = that Team Lead's id) and to
-- no one else. The two tables were previously unrelated — project_category fed only the Team
-- Lead's own "My Projects" screen, task_category fed only the EOD dropdown, globally/unscoped.
--
-- Numbered 50 against a DB confirmed at V49 via
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- (see V49's own comment for why gaps exist — always re-check before adding the next one).

-- 1. Scope column on task_category: NULL = global (visible to every employee, unchanged
--    behaviour for the existing 19 seeded rows). Non-null = owned by that manager's (Team
--    Lead's) team — only employees whose own manager_id matches (or the manager themself) see it.
ALTER TABLE task_category
    ADD COLUMN manager_id BIGINT NULL REFERENCES app_user (id);

-- 2. The old single global UNIQUE(name) can't coexist with per-team category names that happen
--    to match a global name (e.g. a Team Lead's own "Development") or another team's category
--    name. Replace it with two partial unique indexes: names stay unique among global rows, and
--    unique per manager among team-scoped rows, but the same name may appear once globally and
--    once per team.
ALTER TABLE task_category DROP CONSTRAINT task_category_name_key;

CREATE UNIQUE INDEX task_category_global_name_uq
    ON task_category (name) WHERE manager_id IS NULL;

CREATE UNIQUE INDEX task_category_manager_name_uq
    ON task_category (manager_id, name) WHERE manager_id IS NOT NULL;

-- 3. Bookkeeping link so a ProjectCategory row can be traced to the TaskCategory row mirroring
--    it (set going forward by TeamLeadProjectService.createCategory, and by the backfill below
--    for rows that predate this change).
ALTER TABLE project_category
    ADD COLUMN task_category_id BIGINT NULL REFERENCES task_category (id);

-- 4. Backfill: every ProjectCategory created before this change gets a mirrored, team-scoped
--    TaskCategory row so it doesn't silently disappear from employees' EOD dropdown. Defaults
--    (is_productive = true, is_billable_default = false) match what the Team Lead's simplified
--    category form collects today — name, description, status only.
INSERT INTO task_category (name, is_productive, is_billable_default, active, manager_id)
SELECT pc.name, TRUE, FALSE, (pc.status = 'ACTIVE'), pc.created_by
FROM project_category pc
WHERE pc.task_category_id IS NULL;

UPDATE project_category pc
SET task_category_id = tc.id
FROM task_category tc
WHERE pc.task_category_id IS NULL
  AND tc.manager_id = pc.created_by
  AND tc.name = pc.name;
