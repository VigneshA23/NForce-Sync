-- Part of the Billable/Non-Billable classification removal.
--
-- Drops the per-task billable flag (V4) and the approval-gate "has a Team Lead decided this
-- task's billable status" tracker (V52/V56/V64) together, since the gate exists only to protect
-- the flag: SaveEodTaskRequest/EodTaskDto/EodTask no longer expose either, EodService.buildTask
-- no longer sets them, and ApprovalService no longer gates approve()/batchApprove() on them.

ALTER TABLE eod_task DROP COLUMN is_billable;
ALTER TABLE eod_task DROP COLUMN billable_decided;
