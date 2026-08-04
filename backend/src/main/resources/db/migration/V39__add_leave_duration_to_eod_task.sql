-- Distinguishes full-day vs half-day approved leave so utilization's
-- "Available Working Hours" can exclude/halve the day accordingly.
-- Nullable: only meaningful on tasks whose category is 'Leave / Holiday'.
ALTER TABLE eod_task
    ADD COLUMN leave_duration VARCHAR(10);

ALTER TABLE eod_task
    ADD CONSTRAINT eod_task_leave_duration_check
    CHECK (leave_duration IS NULL OR leave_duration IN ('FULL_DAY', 'HALF_DAY'));
