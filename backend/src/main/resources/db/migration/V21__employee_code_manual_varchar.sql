-- Employee ID moves from a DB auto-generated BIGINT identity to a manually-entered,
-- human-readable code (format NF-#####) chosen by the Super Admin at user creation.
-- Existing numeric codes are reformatted to the same NF-##### shape so historical
-- records stay consistent with newly-entered ones.

ALTER TABLE app_user ALTER COLUMN employee_code DROP IDENTITY IF EXISTS;

ALTER TABLE app_user
    ALTER COLUMN employee_code TYPE VARCHAR(20)
    USING ('NF-' || LPAD(employee_code::text, 5, '0'));

ALTER TABLE app_user
    ADD CONSTRAINT app_user_employee_code_format_chk
    CHECK (employee_code ~ '^NF-\d{5}$');
