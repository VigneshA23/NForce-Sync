-- Employee ID format moves from NF-##### (5 digits) to NF-######## (8 digits)
-- for newly created users. Existing users keep their historical NF-##### codes
-- unchanged (no re-numbering, no fake data) — the CHECK constraint is widened
-- to accept either shape so both coexist. Application-level validation
-- (frontend + CreateUserRequest) enforces the 8-digit format for new entries.

ALTER TABLE app_user DROP CONSTRAINT app_user_employee_code_format_chk;

ALTER TABLE app_user
    ADD CONSTRAINT app_user_employee_code_format_chk
    CHECK (employee_code ~ '^NF-(\d{5}|\d{8})$');
