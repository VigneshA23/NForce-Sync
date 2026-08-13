-- Numbered against the LIVE database (flyway_schema_history was at 57 — "eod entry manager
-- snapshot"), not against the files in this repo, which lag it: V53, V54, V55 and V57 were
-- applied from other working copies and their files are absent here. Re-verify with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- before applying anywhere else — Flyway silently skips a file at or below the recorded
-- version, and the app then dies at boot on the missing column.
--
-- Moves the EOD cutoff from a single global time-of-day (business_rule_config.eod_cutoff_time)
-- to an hours-after-shift-end offset per shift. A bare time-of-day cannot express a deadline for
-- a shift that crosses midnight: for Evening (15:30-00:30), comparing the global 00:30 as a plain
-- time read as 15 hours BEFORE the shift started, which is why EmployeeService.buildCutoffStatus
-- carries a cutoffNextDay workaround. "shift end + N hours" is unambiguous for every shift and
-- lets each one carry its own grace period.
--
-- NULL means no cutoff is configured for that shift: no reminder is sent and no cutoff banner is
-- shown, the same way an employee with no shift assigned gets neither.
ALTER TABLE shift_definition
    ADD COLUMN eod_cutoff_hours NUMERIC(4,2);

-- Backfill from the current global cutoff so existing behaviour is preserved — without this every
-- employee's dashboard cutoff banner would silently disappear the moment the global value stops
-- being read.
--
-- Reproduces the two anchoring rules the old code used, in minute arithmetic:
--   * end_time <= start_time means the shift ends the NEXT day, so its end is start-relative +24h
--     (mirrors EodService.shiftDurationMinutes)
--   * a global cutoff earlier than the shift's start was treated as next-day
--     (mirrors EmployeeService.buildCutoffStatus's cutoffNextDay)
-- then takes the gap between shift end and cutoff, clamped at 0 so a cutoff that already sits
-- before the shift end degrades to "due at shift end" rather than a negative offset.
--
-- For the three rows present when this was written (global cutoff 00:30):
--   Evening Shift 15:30-00:30 -> 0.00   (the cutoff already equalled the shift end)
--   General       09:00-18:00 -> 6.50
--   Early         07:00-16:00 -> 8.50
WITH anchored AS (
    SELECT
        s.id,
        (EXTRACT(HOUR FROM s.start_time) * 60 + EXTRACT(MINUTE FROM s.start_time))::int AS start_min,
        (EXTRACT(HOUR FROM s.end_time)   * 60 + EXTRACT(MINUTE FROM s.end_time))::int   AS end_min_raw,
        (EXTRACT(HOUR FROM c.eod_cutoff_time) * 60 + EXTRACT(MINUTE FROM c.eod_cutoff_time))::int AS cutoff_min_raw
    FROM shift_definition s
    CROSS JOIN business_rule_config c
    WHERE c.id = 1 AND c.eod_cutoff_time IS NOT NULL
), resolved AS (
    SELECT
        id,
        CASE WHEN end_min_raw    <= start_min THEN end_min_raw    + 1440 ELSE end_min_raw    END AS end_min,
        CASE WHEN cutoff_min_raw <  start_min THEN cutoff_min_raw + 1440 ELSE cutoff_min_raw END AS cutoff_min
    FROM anchored
)
UPDATE shift_definition s
SET eod_cutoff_hours = ROUND(GREATEST(r.cutoff_min - r.end_min, 0) / 60.0, 2)
FROM resolved r
WHERE s.id = r.id;
