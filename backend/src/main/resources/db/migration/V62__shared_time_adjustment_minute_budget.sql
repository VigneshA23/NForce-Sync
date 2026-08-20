-- Time adjustments move from three independent per-type COUNTS to one shared monthly
-- MINUTE budget.
--
-- The old model let an employee spend far more than intended: late_arrival_allowance,
-- early_leave_allowance and intervening_allowance were counted separately, and each use
-- could run to the 120-minute per-use cap. One of each per month was therefore up to
-- 6 hours, not the 2 hours the policy intends.
--
-- The new column is a single pool spent across all three types, so 2 hours taken entirely
-- as an early log-off leaves nothing for a late arrival or a mid-shift break.
ALTER TABLE business_rule_config
    ADD COLUMN monthly_adjustment_minutes INTEGER NOT NULL DEFAULT 120;

-- The three count columns have no meaning under the pooled model, and leaving them behind
-- would let a stale value quietly re-enter a future query.
ALTER TABLE business_rule_config
    DROP COLUMN late_arrival_allowance,
    DROP COLUMN early_leave_allowance,
    DROP COLUMN intervening_allowance;
