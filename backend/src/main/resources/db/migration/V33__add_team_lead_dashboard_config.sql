-- Team Lead Dashboard: utilization thresholds and "team at risk" threshold, added to the
-- existing business_rule_config singleton row (same Admin Config surface used by the
-- Business Rules page) so nothing new needs to be introduced for config storage.
ALTER TABLE business_rule_config
    ADD COLUMN underutilized_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 60,
    ADD COLUMN overloaded_threshold_pct    NUMERIC(5,2) NOT NULL DEFAULT 100,
    ADD COLUMN at_risk_missing_pct         NUMERIC(5,2) NOT NULL DEFAULT 30;

-- Lightweight "acknowledge" action on a blocked task, distinct from full approval actions.
ALTER TABLE eod_task
    ADD COLUMN acknowledged_at TIMESTAMPTZ,
    ADD COLUMN acknowledged_by_id BIGINT REFERENCES app_user(id);
