ALTER TABLE business_rule_config
    ADD COLUMN non_project_auto_approve_hours NUMERIC(4,2) NOT NULL DEFAULT 1.0;
