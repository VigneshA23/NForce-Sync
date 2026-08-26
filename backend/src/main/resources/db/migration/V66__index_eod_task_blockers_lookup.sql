-- V66: indexes backing the Blockers pages' lookup (task_status = 'BLOCKED' scoped to a
-- project set, then narrowed by eod_entry.entry_date) — previously an unindexed scan of every
-- eod_task row for the PM's whole portfolio on every date-filter change.

CREATE INDEX idx_eod_task_project_status ON eod_task (project_id, task_status);
CREATE INDEX idx_eod_entry_entry_date ON eod_entry (entry_date);
