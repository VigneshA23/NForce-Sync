-- Self-service contact fields — populated via PATCH /api/profile (not admin-controlled).
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS phone                   VARCHAR(30),
    ADD COLUMN IF NOT EXISTS emergency_contact_name  VARCHAR(200),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(30);
