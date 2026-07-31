-- Team Lead Dashboard: configurable "blocker open too long" alert threshold, added to the
-- same Admin Config singleton used for the utilization thresholds (V33).
ALTER TABLE business_rule_config
    ADD COLUMN blocker_age_alert_hours NUMERIC(5,2) NOT NULL DEFAULT 4;
