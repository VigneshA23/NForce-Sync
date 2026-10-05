-- Phase 8b follow-up: plain-log additional notes field.
-- log_summary is the required "what did you do" field (20-4000 chars).
-- log_notes is an optional, collapsible "anything else" field (no length limit enforced in SQL).
ALTER TABLE eod_entry ADD COLUMN log_notes TEXT NULL;
