-- Add employment_type, work_mode, joining_date to app_user (OneHR parity)
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS work_mode      VARCHAR(50);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS joining_date   DATE;
