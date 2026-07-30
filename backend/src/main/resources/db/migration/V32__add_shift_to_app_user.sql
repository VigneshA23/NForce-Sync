-- Shift assignment on the user record — shift timings themselves stay centrally
-- managed in shift_definition (Business Rules); this is just the FK linking a user
-- to one. ON DELETE SET NULL so removing a shift definition doesn't block on
-- assigned users — it just leaves them unassigned.
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES shift_definition(id) ON DELETE SET NULL;
