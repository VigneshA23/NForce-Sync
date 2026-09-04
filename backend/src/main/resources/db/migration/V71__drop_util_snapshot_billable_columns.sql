-- Part of the Billable/Non-Billable classification removal.
--
-- billable_hours/non_billable_hours (V6) were a reporting-only split of approved_productive_hours
-- by task-level billable status. approved_productive_hours, bench_hours, idle_hours and
-- utilization_pct are untouched by this migration — THE SPINE invariant (available==0 -> NULL,
-- 0 approved + available>0 -> 0.00) was always computed independently of the billable split and
-- keeps working exactly as before.

ALTER TABLE util_snapshot DROP COLUMN billable_hours;
ALTER TABLE util_snapshot DROP COLUMN non_billable_hours;
