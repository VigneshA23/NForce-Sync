-- Seed test users for manager-assignment verification
-- Password hash: Spring BCryptPasswordEncoder(10) of "ChangeMe123!" — verified

-- teamlead@nforceone.com — MANAGER role
INSERT INTO app_user (full_name, email, password_hash, role, status, created_at, created_by)
SELECT 'Team Lead', 'teamlead@nforceone.com',
       '$2a$10$eLFmSIWqtvZ05vyxM5UZauimr5UdTqFevbYIgH.KKyjNrRAlIeRp6',
       'MANAGER', 'ACTIVE', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'teamlead@nforceone.com');

-- employee@nforceone.com — EMPLOYEE role
INSERT INTO app_user (full_name, email, password_hash, role, status, created_at, created_by)
SELECT 'Employee User', 'employee@nforceone.com',
       '$2a$10$eLFmSIWqtvZ05vyxM5UZauimr5UdTqFevbYIgH.KKyjNrRAlIeRp6',
       'EMPLOYEE', 'ACTIVE', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'employee@nforceone.com');

-- projectmanager@nforceone.com — PM role (used to verify rejection of non-MANAGER assignment)
INSERT INTO app_user (full_name, email, password_hash, role, status, created_at, created_by)
SELECT 'Project Manager', 'projectmanager@nforceone.com',
       '$2a$10$eLFmSIWqtvZ05vyxM5UZauimr5UdTqFevbYIgH.KKyjNrRAlIeRp6',
       'PM', 'ACTIVE', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE email = 'projectmanager@nforceone.com');

-- Ensure employee@nforceone.com starts with no manager (clean slate for verification)
UPDATE app_user SET manager_id = NULL WHERE email = 'employee@nforceone.com';
