-- Phase 4: correct the backwards column names on the project table.
-- pm_id always held the Team Lead (the approver); project_manager_id held the actual PM.
-- Rename to reflect what the data actually means. No data movement — pure rename.
ALTER TABLE project RENAME COLUMN pm_id TO lead_id;
ALTER TABLE project RENAME COLUMN project_manager_id TO pm_id;
