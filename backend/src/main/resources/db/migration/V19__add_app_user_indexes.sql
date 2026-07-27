-- Fix 3: Add missing indexes to prevent full table scans on app_user
-- Neon (remote DB) makes each unindexed query expensive over the network

CREATE INDEX IF NOT EXISTS idx_app_user_status
    ON app_user(status);

CREATE INDEX IF NOT EXISTS idx_app_user_role
    ON app_user(role);

CREATE INDEX IF NOT EXISTS idx_app_user_role_status
    ON app_user(role, status);

CREATE INDEX IF NOT EXISTS idx_app_user_department_id
    ON app_user(department_id);

CREATE INDEX IF NOT EXISTS idx_app_user_designation_id
    ON app_user(designation_id);

CREATE INDEX IF NOT EXISTS idx_app_user_location_id
    ON app_user(location_id);

CREATE INDEX IF NOT EXISTS idx_app_user_manager_id
    ON app_user(manager_id);
