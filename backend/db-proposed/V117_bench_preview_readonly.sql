-- READ-ONLY pre-release check for V117 / Bench Log: who flips to bench-mode today?
-- Mirrors BenchModePolicy.isBenchMode + AuthController.computeEodForm for the EMPLOYEE role:
--   active EMPLOYEE-role user, with
--   (1) no allocation covering today on an ACTIVE project (allocation windows inclusive, null end = open),
--   (2) no ACTIVE project where they are the lead (project.lead_id),
--   (3) no ACTIVE direct reports (same definition as ReportingScopeService.hasDirectReports).
-- Run inside a read-only transaction. Note: CURRENT_DATE is the DB server's date (UTC on Neon); the
-- app uses the JVM's LocalDate.now(), so people allocated/ending exactly "today" may differ near midnight.
BEGIN READ ONLY;
SELECT u.id, u.employee_code, u.full_name, u.email,
       m.full_name AS reporting_manager,
       (SELECT count(*) FROM allocation a2 WHERE a2.employee_id = u.id) AS allocation_rows_ever,
       (SELECT max(a2.effective_to) FROM allocation a2 WHERE a2.employee_id = u.id) AS last_allocation_end
FROM app_user u
LEFT JOIN app_user m ON m.id = u.manager_id
WHERE u.role = 'EMPLOYEE' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM allocation a JOIN project p ON p.id = a.project_id
                  WHERE a.employee_id = u.id AND p.status = 'ACTIVE'
                    AND a.effective_from <= CURRENT_DATE
                    AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE))
  AND NOT EXISTS (SELECT 1 FROM project p WHERE p.lead_id = u.id AND p.status = 'ACTIVE')
  AND NOT EXISTS (SELECT 1 FROM app_user r WHERE r.manager_id = u.id AND r.status = 'ACTIVE' AND r.deleted_at IS NULL)
ORDER BY u.full_name;
COMMIT;
