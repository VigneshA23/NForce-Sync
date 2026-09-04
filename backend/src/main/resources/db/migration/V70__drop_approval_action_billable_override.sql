-- Part of the Billable/Non-Billable classification removal.
--
-- billable_override (V5) was the legacy whole-entry mechanism that predated the per-task
-- billable_decided gate (dropped in V69) and was still consulted by
-- UtilizationService.buildSnapshot to reclassify a task's billable status when computing the
-- now-removed util_snapshot.billable_hours/non_billable_hours split (see V71). Nothing reads it
-- any more.

ALTER TABLE approval_action DROP COLUMN billable_override;
