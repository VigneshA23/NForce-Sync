-- Time Adjustment: a partial-day schedule shift on an otherwise normal working day
-- (late arrival, mid-shift absence, early leave). Distinct from Leave, which is an absence.
--
-- Numbered V36: live DB was at V34 and V35 (day type) is pending. Flyway silently SKIPS any
-- file at or below the recorded version and the app then dies at boot — see backend/CLAUDE.md.

-- Type/minutes are nullable: absent means "no adjustment on this entry".
-- is_overtime/overtime_hours record hours logged beyond the day's reference. Hours never
-- block a submission; they are flagged here for the manager instead.
ALTER TABLE eod_entry
    ADD COLUMN IF NOT EXISTS time_adjustment_type    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS time_adjustment_minutes INT,
    ADD COLUMN IF NOT EXISTS is_overtime             BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS overtime_hours          NUMERIC(5,2);

-- Monthly allowance = how many times per calendar month each type may be used. Separate from
-- the per-use duration limit (30-120 minutes), which is enforced in code. Added to the
-- existing singleton config row, so these are global — no per-role or per-department override.
ALTER TABLE business_rule_config
    ADD COLUMN IF NOT EXISTS late_arrival_allowance INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS early_leave_allowance  INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS intervening_allowance  INT NOT NULL DEFAULT 3;
