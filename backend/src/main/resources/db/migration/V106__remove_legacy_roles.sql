-- Phase 8b: convert MANAGER, DM, FINANCE, LEADERSHIP to EMPLOYEE, then
-- drop those four values from the role CHECK constraint.
-- project.lead_id rows are intentionally untouched: lead assignment is a
-- project attribute, not a role, and survives the conversion.

-- 1. Convert first so no row violates the new constraint
UPDATE app_user SET role = 'EMPLOYEE'
WHERE role IN ('MANAGER', 'DM', 'FINANCE', 'LEADERSHIP');

-- 2. Replace the CHECK constraint (drop old, add new without the four values)
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
    CHECK (role IN ('EMPLOYEE', 'PM', 'ADMIN', 'SUPERADMIN'));
