-- Backfill eod_project_approval for all existing eod_entry rows (Phase 2, decision 6).
-- All existing rows have entry_form = 'PROJECT_GROUPED' (V100 default). No PLAIN_LOG rows exist.
-- Strategy:
--   APPROVED  -> one piece per distinct project (status=APPROVED, actor+timestamp from approval_action)
--             -> one non-project piece if any non-project tasks exist (status=APPROVED)
--   REJECTED  -> same project grouping, status=REJECTED, comment from rejection action
--   SUBMITTED -> route fresh under current rules using SQL approximation of ApprovalPieceRouter
--   DRAFT, MISSED -> no pieces

-- ── APPROVED entries: project pieces ─────────────────────────────────────────────────────────
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, created_at)
SELECT DISTINCT ON (ee.id, t.project_id)
    ee.id                                                   AS eod_entry_id,
    t.project_id,
    la.actor_id                                             AS approver_id,
    CASE
        WHEN la.actor_id = p.pm_id               THEN 'LEAD'
        WHEN la.actor_id = p.project_manager_id  THEN 'PM'
        ELSE                                           'REPORTING_MANAGER'
    END                                                     AS approver_type,
    'APPROVED'                                              AS status,
    COALESCE(ee.submitted_at, ee.created_at)                AS frozen_at,
    la.acted_at,
    now()                                                   AS created_at
FROM eod_entry ee
JOIN eod_task t ON t.eod_entry_id = ee.id AND t.project_id IS NOT NULL
JOIN project p  ON p.id = t.project_id
JOIN (
    SELECT DISTINCT ON (eod_entry_id) eod_entry_id, actor_id, acted_at
    FROM approval_action
    WHERE action = 'APPROVE'
    ORDER BY eod_entry_id, acted_at DESC
) la ON la.eod_entry_id = ee.id
WHERE ee.status = 'APPROVED'
ORDER BY ee.id, t.project_id;

-- ── APPROVED entries: non-project piece ──────────────────────────────────────────────────────
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, created_at)
SELECT
    ee.id                                                   AS eod_entry_id,
    NULL                                                    AS project_id,
    la.actor_id                                             AS approver_id,
    'REPORTING_MANAGER'                                     AS approver_type,
    'APPROVED'                                              AS status,
    COALESCE(ee.submitted_at, ee.created_at)                AS frozen_at,
    la.acted_at,
    now()                                                   AS created_at
FROM eod_entry ee
JOIN (
    SELECT DISTINCT ON (eod_entry_id) eod_entry_id, actor_id, acted_at
    FROM approval_action
    WHERE action = 'APPROVE'
    ORDER BY eod_entry_id, acted_at DESC
) la ON la.eod_entry_id = ee.id
WHERE ee.status = 'APPROVED'
  AND EXISTS (
      SELECT 1 FROM eod_task t2
      WHERE t2.eod_entry_id = ee.id AND t2.project_id IS NULL
  );

-- ── REJECTED entries: project pieces ─────────────────────────────────────────────────────────
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, comment, created_at)
SELECT DISTINCT ON (ee.id, t.project_id)
    ee.id                                                   AS eod_entry_id,
    t.project_id,
    lr.actor_id                                             AS approver_id,
    CASE
        WHEN lr.actor_id = p.pm_id              THEN 'LEAD'
        WHEN lr.actor_id = p.project_manager_id THEN 'PM'
        ELSE                                          'REPORTING_MANAGER'
    END                                                     AS approver_type,
    'REJECTED'                                              AS status,
    COALESCE(ee.submitted_at, ee.created_at)                AS frozen_at,
    lr.acted_at,
    lr.comment,
    now()                                                   AS created_at
FROM eod_entry ee
JOIN eod_task t ON t.eod_entry_id = ee.id AND t.project_id IS NOT NULL
JOIN project p  ON p.id = t.project_id
JOIN (
    SELECT DISTINCT ON (eod_entry_id) eod_entry_id, actor_id, acted_at, comment
    FROM approval_action
    WHERE action = 'REJECT'
    ORDER BY eod_entry_id, acted_at DESC
) lr ON lr.eod_entry_id = ee.id
WHERE ee.status = 'REJECTED'
ORDER BY ee.id, t.project_id;

-- ── REJECTED entries: non-project piece ──────────────────────────────────────────────────────
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, comment, created_at)
SELECT
    ee.id                                                   AS eod_entry_id,
    NULL                                                    AS project_id,
    lr.actor_id                                             AS approver_id,
    'REPORTING_MANAGER'                                     AS approver_type,
    'REJECTED'                                              AS status,
    COALESCE(ee.submitted_at, ee.created_at)                AS frozen_at,
    lr.acted_at,
    lr.comment,
    now()                                                   AS created_at
FROM eod_entry ee
JOIN (
    SELECT DISTINCT ON (eod_entry_id) eod_entry_id, actor_id, acted_at, comment
    FROM approval_action
    WHERE action = 'REJECT'
    ORDER BY eod_entry_id, acted_at DESC
) lr ON lr.eod_entry_id = ee.id
WHERE ee.status = 'REJECTED'
  AND EXISTS (
      SELECT 1 FROM eod_task t2
      WHERE t2.eod_entry_id = ee.id AND t2.project_id IS NULL
  );

-- ── SUBMITTED entries: project pieces (fresh routing) ────────────────────────────────────────
-- Routing approximation of ApprovalPieceRouter.routeProjectPiece:
--   employee IS the lead  -> route to employee's RM (manager_id snapshot), or ADMIN_GROUP if null
--   lead assigned, not employee -> route to lead (LEAD)
--   no lead assigned -> route to PM (PM)
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, created_at)
SELECT DISTINCT ON (ee.id, t.project_id)
    ee.id                                                                    AS eod_entry_id,
    t.project_id,
    CASE
        WHEN p.pm_id = ee.employee_id AND ee.manager_id IS NOT NULL THEN ee.manager_id
        WHEN p.pm_id = ee.employee_id AND ee.manager_id IS NULL     THEN NULL
        WHEN p.pm_id IS NOT NULL                                     THEN p.pm_id
        ELSE                                                              p.project_manager_id
    END                                                                      AS approver_id,
    CASE
        WHEN p.pm_id = ee.employee_id AND ee.manager_id IS NOT NULL THEN 'REPORTING_MANAGER'
        WHEN p.pm_id = ee.employee_id AND ee.manager_id IS NULL     THEN 'ADMIN_GROUP'
        WHEN p.pm_id IS NOT NULL                                     THEN 'LEAD'
        ELSE                                                              'PM'
    END                                                                      AS approver_type,
    'PENDING'                                                                AS status,
    COALESCE(ee.submitted_at, ee.created_at)                                 AS frozen_at,
    NULL                                                                     AS acted_at,
    now()                                                                    AS created_at
FROM eod_entry ee
JOIN eod_task t ON t.eod_entry_id = ee.id AND t.project_id IS NOT NULL
JOIN project p  ON p.id = t.project_id
WHERE ee.status = 'SUBMITTED'
ORDER BY ee.id, t.project_id;

-- ── SUBMITTED entries: non-project pieces ────────────────────────────────────────────────────
-- ApprovalPieceRouter.routeNonProjectPiece: hours <= threshold -> AUTO_APPROVED; else RM/ADMIN_GROUP
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, created_at)
SELECT
    ee.id                                                                    AS eod_entry_id,
    NULL                                                                     AS project_id,
    CASE
        WHEN SUM(COALESCE(t.hours, 0)) <= (SELECT non_project_auto_approve_hours FROM business_rule_config WHERE id = 1)
            THEN NULL
        WHEN ee.manager_id IS NOT NULL
            THEN ee.manager_id
        ELSE NULL
    END                                                                      AS approver_id,
    CASE
        WHEN SUM(COALESCE(t.hours, 0)) <= (SELECT non_project_auto_approve_hours FROM business_rule_config WHERE id = 1)
            THEN 'AUTO_APPROVED'
        WHEN ee.manager_id IS NOT NULL
            THEN 'REPORTING_MANAGER'
        ELSE 'ADMIN_GROUP'
    END                                                                      AS approver_type,
    CASE
        WHEN SUM(COALESCE(t.hours, 0)) <= (SELECT non_project_auto_approve_hours FROM business_rule_config WHERE id = 1)
            THEN 'APPROVED'
        ELSE 'PENDING'
    END                                                                      AS status,
    COALESCE(ee.submitted_at, ee.created_at)                                 AS frozen_at,
    CASE
        WHEN SUM(COALESCE(t.hours, 0)) <= (SELECT non_project_auto_approve_hours FROM business_rule_config WHERE id = 1)
            THEN COALESCE(ee.submitted_at, ee.created_at)
        ELSE NULL
    END                                                                      AS acted_at,
    now()                                                                    AS created_at
FROM eod_entry ee
JOIN eod_task t ON t.eod_entry_id = ee.id AND t.project_id IS NULL
WHERE ee.status = 'SUBMITTED'
GROUP BY ee.id, ee.manager_id, ee.submitted_at, ee.created_at
HAVING SUM(COALESCE(t.hours, 0)) > 0;
