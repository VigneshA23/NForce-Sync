-- Extended self-service profile fields — populated via PATCH /api/profile.
-- photo_data stores a base64 data URL (data:<mime>;base64,<bytes>) for the avatar image.
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS date_of_birth  DATE,
    ADD COLUMN IF NOT EXISTS gender         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS personal_email VARCHAR(200),
    ADD COLUMN IF NOT EXISTS address        TEXT,
    ADD COLUMN IF NOT EXISTS photo_data     TEXT;
