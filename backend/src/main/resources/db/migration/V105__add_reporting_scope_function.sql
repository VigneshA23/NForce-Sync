CREATE OR REPLACE FUNCTION reporting_scope_member_ids(actor_id BIGINT)
RETURNS TABLE(user_id BIGINT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE subtree(id, depth) AS (
    SELECT u.id, 0 FROM app_user u
    WHERE u.manager_id = actor_id
      AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
    UNION ALL
    SELECT u.id, st.depth + 1 FROM app_user u
    JOIN subtree st ON u.manager_id = st.id
    WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
      AND st.depth < 20
  ),
  project_members AS (
    SELECT DISTINCT a.employee_id
    FROM allocation a
    JOIN project p ON p.id = a.project_id
    WHERE p.lead_id IN (SELECT id FROM subtree)
      AND a.employee_id <> actor_id
      AND a.employee_id NOT IN (SELECT id FROM subtree)
      AND a.effective_from <= CURRENT_DATE
      AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM app_user u2 WHERE u2.id = a.employee_id AND u2.status = 'ACTIVE' AND u2.deleted_at IS NULL)
  )
  SELECT id FROM subtree
  UNION
  SELECT employee_id FROM project_members;
$$;
