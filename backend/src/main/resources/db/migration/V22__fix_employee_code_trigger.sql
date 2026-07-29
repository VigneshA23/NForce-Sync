-- Restore employee_code auto-generation for the NF-XXXXX format.
-- V21 (applied externally) changed the column from BIGINT GENERATED ALWAYS AS IDENTITY
-- to VARCHAR, but the generation trigger was lost or never committed.

-- Step 1: Create sequence, seeded from the current max code (skip if exists)
DO $$
DECLARE
    max_code INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'employee_code_seq') THEN
        -- Find highest existing numeric suffix (e.g. NF-01001 -> 1001)
        SELECT COALESCE(
            MAX(CAST(SUBSTRING(employee_code FROM 4) AS INTEGER)),
            1001
        )
        INTO max_code
        FROM app_user
        WHERE employee_code ~ '^NF-\d+$';

        EXECUTE format('CREATE SEQUENCE employee_code_seq START WITH %s INCREMENT BY 1 NO MAXVALUE NO CYCLE', max_code + 1);
    END IF;
END $$;

-- Step 2: Trigger function that assigns NF-XXXXX on INSERT when code is NULL
CREATE OR REPLACE FUNCTION fn_generate_employee_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.employee_code IS NULL THEN
        NEW.employee_code := 'NF-' || LPAD(NEXTVAL('employee_code_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Attach trigger (replace if already exists)
DROP TRIGGER IF EXISTS trg_employee_code ON app_user;
CREATE TRIGGER trg_employee_code
    BEFORE INSERT ON app_user
    FOR EACH ROW
    EXECUTE FUNCTION fn_generate_employee_code();
