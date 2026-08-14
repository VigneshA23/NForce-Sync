-- V61: reintroduce the allocation percentage, this time to stay.
--
-- History: V3 introduced allocation_pct, V29 dropped it (allocation simplified to a plain
-- assignment), V40 reintroduced it for the PM Project Dashboard's planned-utilization math, V48
-- dropped it again ("every allocation counts as full-time" — no capacity ceiling). The Planned
-- vs Actual Utilization feature needs a genuine per-allocation capacity split: an employee split
-- 50/30/20 across three concurrent projects must plan each one at its own share, not 100% each.
--
-- Same convention V40 used: SMALLINT, whole percentage points, 1-100, existing rows default to
-- 100 (full-time) — every allocation created before this column existed was treated as full-time
-- by every utilization calculation that reads it, so 100 keeps prior planned-hours figures
-- unchanged for historical data. PMs can edit individual rows down afterward.
--
-- Before running: confirm the live schema version with
--   SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;
-- (recorded at 60 when this file was authored).
ALTER TABLE allocation
    ADD COLUMN allocation_pct SMALLINT NOT NULL DEFAULT 100
    CHECK (allocation_pct BETWEEN 1 AND 100);
