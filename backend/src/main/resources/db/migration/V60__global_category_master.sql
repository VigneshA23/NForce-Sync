-- V60: enforce a single GLOBAL category master, per business rule that task categories are
-- generic, application-wide data — never Team-Lead-, team-, project-, or employee-scoped.
--
-- Numbered 60 against a DB confirmed at V59 via
--   SELECT version, description FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
-- (see backend/CLAUDE.md — the live DB regularly runs ahead of the files committed here;
-- always re-check before adding the next migration).
--
-- ROOT CAUSE of the duplicate "Development" / "Documentation" / "Code Review" rows an employee
-- sees in the Submit EOD category dropdown: V50 added task_category.manager_id so a Team Lead's
-- own category (mirrored from project_category) would only be visible to their own team. That
-- let a Team Lead's category coexist as a *second* row under a name a global category already
-- had, and would have let two different Team Leads each hold their own separate row for the same
-- name — both violate "one category per name, application-wide". Confirmed against the live
-- Neon data before writing this migration: task_category ids (8 global / 22 team-scoped)
-- Development, (9 / 28) Code Review, (13 / 24) Documentation.
--
-- This migration is data-driven (matches by normalized name, not hardcoded ids), so it is safe
-- to run unchanged against any environment's actual data, including one with no duplicates at
-- all (a fresh local DB that never accumulated any).

-- 1. For every normalized name that currently has more than one task_category row, repoint
--    eod_task and project_category references from every non-canonical row onto one canonical
--    row (prefer the pre-existing global row — manager_id IS NULL — else the lowest id), then
--    remove the now-unreferenced duplicate rows. No EOD history is lost: the FK is repointed,
--    never nulled, before the duplicate row is deleted.
WITH normalized AS (
    SELECT id, manager_id, lower(btrim(name)) AS norm FROM task_category
), canonical AS (
    SELECT DISTINCT ON (norm) norm, id AS canonical_id
    FROM normalized
    ORDER BY norm, (manager_id IS NULL) DESC, id ASC
), remap AS (
    SELECT n.id AS old_id, c.canonical_id
    FROM normalized n JOIN canonical c ON c.norm = n.norm
    WHERE n.id <> c.canonical_id
)
UPDATE eod_task et
SET task_category_id = r.canonical_id
FROM remap r
WHERE et.task_category_id = r.old_id;

WITH normalized AS (
    SELECT id, manager_id, lower(btrim(name)) AS norm FROM task_category
), canonical AS (
    SELECT DISTINCT ON (norm) norm, id AS canonical_id
    FROM normalized
    ORDER BY norm, (manager_id IS NULL) DESC, id ASC
), remap AS (
    SELECT n.id AS old_id, c.canonical_id
    FROM normalized n JOIN canonical c ON c.norm = n.norm
    WHERE n.id <> c.canonical_id
)
UPDATE project_category pc
SET task_category_id = r.canonical_id
FROM remap r
WHERE pc.task_category_id = r.old_id;

WITH normalized AS (
    SELECT id, manager_id, lower(btrim(name)) AS norm FROM task_category
), canonical AS (
    SELECT DISTINCT ON (norm) norm, id AS canonical_id
    FROM normalized
    ORDER BY norm, (manager_id IS NULL) DESC, id ASC
), remap AS (
    SELECT n.id AS old_id, c.canonical_id
    FROM normalized n JOIN canonical c ON c.norm = n.norm
    WHERE n.id <> c.canonical_id
)
DELETE FROM task_category WHERE id IN (SELECT old_id FROM remap);

-- 2. Every remaining team-scoped row is promoted to global — after step 1, no remaining name
--    collides with another (verified against live data: the only collisions were the three
--    consolidated above), and categories are never team-scoped going forward.
UPDATE task_category SET manager_id = NULL WHERE manager_id IS NOT NULL;

-- 3. Replace V50's per-manager scoping with the sole, final protection against duplicates: one
--    global, case- and whitespace-normalized unique index. The scoping column is dropped
--    entirely — there is no longer any notion of a "team's" category.
DROP INDEX IF EXISTS task_category_manager_name_uq;
DROP INDEX IF EXISTS task_category_global_name_uq;
ALTER TABLE task_category DROP COLUMN IF EXISTS manager_id;
CREATE UNIQUE INDEX task_category_normalized_name_uq ON task_category (lower(btrim(name)));

-- 4. project_category (the Team Lead "Category Management" master) had the mirror-opposite
--    problem: UNIQUE(created_by, name) let a *different* Team Lead freely create a colliding
--    name as their own separate row. Category names are shared, global master data, not
--    per-creator — replace with the same global, normalized uniqueness rule. No partial WHERE
--    clause: an INACTIVE category still reserves its name, so it gets reactivated/reused rather
--    than duplicated (see TeamLeadProjectService).
ALTER TABLE project_category DROP CONSTRAINT project_category_created_by_name_uq;
CREATE UNIQUE INDEX project_category_normalized_name_uq ON project_category (lower(btrim(name)));
