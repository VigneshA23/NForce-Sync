-- UserService.REQUIRED_MANAGER_ROLE now also requires a Project Manager's or HR Admin's
-- reporting manager to be a Super Admin (previously only Employee->Team Lead and
-- Team Lead->Project Manager were enforced). That check only runs on create/update, so any
-- PM or HR row whose manager_id was set before this change could hold a manager that no
-- longer satisfies the rule.
--
-- Rather than silently reassigning those rows to some Super Admin, clear the invalid
-- reference (same "safe null-out" approach V13 used for a clean slate) so the user shows up
-- as unassigned in the Reporting Manager field until an admin picks a valid Super Admin.
--
-- Idempotent — only touches rows that currently violate the rule.
UPDATE app_user u
SET manager_id = NULL
WHERE u.role IN ('PM', 'HR')
  AND u.manager_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM app_user m
      WHERE m.id = u.manager_id
        AND m.role = 'SUPERADMIN'
  );
