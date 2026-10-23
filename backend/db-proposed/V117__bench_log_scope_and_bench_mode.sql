-- V117: Bench Log — a third task_category scope, a DB guard that BENCH categories are never
-- productive, six starter categories, and eod_entry.bench_mode.
--
-- PROPOSED ONLY: lives in backend/db-proposed until reviewed; copy to src/main/resources/db/migration
-- when approved. Numbered above V116 — confirmed top version in flyway_schema_history on 2026-10-22
-- (V115 and V116 both applied, success = t). Re-run before copying:
--   SELECT version, description FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
--
-- Does not touch any existing EMPLOYEE or MANAGEMENT category, and does not touch the per-scope
-- unique index task_category_scope_name_uq (scope, lower(btrim(name))): it already lets the same
-- name exist in each scope, so BENCH "Bench Activity" / "Documentation" do not collide with the
-- EMPLOYEE "Bench Activity" or MANAGEMENT "Documentation" rows.

-- 1. Widen the scope CHECK to accept BENCH (drop and re-add; Postgres cannot alter a CHECK in place).
ALTER TABLE task_category DROP CONSTRAINT task_category_scope_check;
ALTER TABLE task_category
    ADD CONSTRAINT task_category_scope_check
    CHECK (scope IN ('EMPLOYEE', 'MANAGEMENT', 'BENCH'));

-- 2. Correct any BENCH row that is somehow productive. None can exist yet (the scope was not
--    allowed until step 1), so this is a no-op today; it keeps step 3 safe if the order is ever changed.
UPDATE task_category SET is_productive = FALSE WHERE scope = 'BENCH' AND is_productive = TRUE;

-- 3. BENCH categories are always non-productive — enforced in the database as well as in the API,
--    so no code path (admin endpoint, script, manual SQL) can create a productive bench category.
ALTER TABLE task_category
    ADD CONSTRAINT task_category_bench_non_productive_ck
    CHECK (scope <> 'BENCH' OR is_productive = FALSE);

-- 4. Seed the starter set. All non-productive, all active (deactivatable from Org Masters).
--    WHERE NOT EXISTS guards a re-run; the unique index is the definitive guard.
INSERT INTO task_category (name, is_productive, active, scope)
SELECT v.n, FALSE, TRUE, 'BENCH'
FROM (VALUES
    ('Learning / Training'),
    ('Certification Prep'),
    ('Internal Tools / Practice'),
    ('Knowledge Transfer'),
    ('Bench Activity'),
    ('Documentation')
) AS v(n)
WHERE NOT EXISTS (
    SELECT 1 FROM task_category t
    WHERE t.scope = 'BENCH' AND lower(btrim(t.name)) = lower(btrim(v.n))
);

-- 5. Bench marker on the entry. Set once at draft creation (like entry_form) from the employee's
--    allocation on the ENTRY DATE, and never changed afterwards. Existing rows become FALSE: no
--    EMPLOYEE could create a PLAIN_LOG entry before this change, so none of them is a bench entry.
ALTER TABLE eod_entry
    ADD COLUMN bench_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- ROLLBACK (manual, only if no BENCH rows are referenced by eod_log_line):
--   ALTER TABLE eod_entry DROP COLUMN bench_mode;
--   ALTER TABLE task_category DROP CONSTRAINT task_category_bench_non_productive_ck;
--   DELETE FROM task_category WHERE scope = 'BENCH';
--   ALTER TABLE task_category DROP CONSTRAINT task_category_scope_check;
--   ALTER TABLE task_category ADD CONSTRAINT task_category_scope_check CHECK (scope IN ('EMPLOYEE','MANAGEMENT'));
