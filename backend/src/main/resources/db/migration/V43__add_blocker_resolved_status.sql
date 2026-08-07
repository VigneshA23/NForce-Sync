-- Adds a manual "Resolved" status the Team Lead can set on a blocker from the Blockers
-- page, layered on top of (not replacing) the existing acknowledged_at "last responder
-- wins" logic: a resolved blocker is always also acknowledged, so every other page that
-- keys off acknowledged_at (Team Dashboard's "Open Blockers" KPI, per-member
-- hasOpenBlocker flag, etc.) keeps working unchanged — resolved blockers already read as
-- "not open" there.
ALTER TABLE eod_task
    ADD COLUMN resolved_at TIMESTAMPTZ,
    ADD COLUMN resolved_by_id BIGINT REFERENCES app_user(id);
