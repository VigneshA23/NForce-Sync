-- Self-service profile banner image — populated via POST/DELETE /api/profile/banner.
-- banner_data stores a base64 data URL (data:<mime>;base64,<bytes>), same pattern as photo_data.
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS banner_data TEXT;
