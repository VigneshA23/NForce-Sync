-- Entry 5 is REJECTED with one task (project_id=4, 8h) but its approval_action history
-- contains only REQUEST_CHANGES rows, no REJECT row. V101 matched on action='REJECT' and
-- silently created no piece. Fix: use the most recent action row regardless of type,
-- treating REQUEST_CHANGES as equivalent to REJECTED for this historical backfill.
INSERT INTO eod_project_approval
    (eod_entry_id, project_id, approver_id, approver_type, status, frozen_at, acted_at, comment, created_at)
SELECT
    ee.id                                                   AS eod_entry_id,
    et.project_id,
    la.actor_id                                             AS approver_id,
    CASE
        WHEN la.actor_id = p.pm_id              THEN 'LEAD'
        WHEN la.actor_id = p.project_manager_id THEN 'PM'
        ELSE                                         'REPORTING_MANAGER'
    END                                                     AS approver_type,
    'REJECTED'                                              AS status,
    COALESCE(ee.submitted_at, ee.created_at)                AS frozen_at,
    la.acted_at,
    la.comment,
    now()                                                   AS created_at
FROM eod_entry ee
JOIN (
    SELECT DISTINCT ON (eod_entry_id) eod_entry_id, actor_id, acted_at, comment
    FROM approval_action
    WHERE eod_entry_id = 5
    ORDER BY eod_entry_id, acted_at DESC
) la ON la.eod_entry_id = ee.id
JOIN eod_task et ON et.eod_entry_id = ee.id AND et.project_id IS NOT NULL
JOIN project p  ON p.id = et.project_id
WHERE ee.id = 5
  AND NOT EXISTS (
      SELECT 1 FROM eod_project_approval WHERE eod_entry_id = 5
  );
