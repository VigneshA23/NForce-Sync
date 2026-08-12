-- Backfill for V52's `eod_task.billable_decided`, split out into its own migration because
-- V52's ALTER had already been applied by the time this backfill was written — an applied
-- migration must never be edited in place (its recorded checksum would no longer match).
--
-- Entries that were already SUBMITTED before the per-task billable review existed have a
-- correct is_billable (EodService.buildTask forces it from project eligibility on every save,
-- independently of this gate) but billable_decided = FALSE, so the new approval gate treats
-- every one of them as undecided: Approve is disabled until the Team Lead re-ticks a value
-- that was already right. Marking them decided scopes the gate to submissions created from
-- here on, which are the only ones a reviewer hasn't actually had a chance to look at yet.
--
-- Deliberately limited to SUBMITTED. APPROVED/REJECTED rows are left FALSE: the gate only
-- ever consults entries still in SUBMITTED status, so backfilling settled history would
-- rewrite records to claim a per-task decision that never happened.
--
-- Idempotent — re-running only re-sets rows that are already TRUE.
UPDATE eod_task t
SET billable_decided = TRUE
FROM eod_entry e
WHERE t.eod_entry_id = e.id
  AND e.status = 'SUBMITTED'
  AND NOT t.billable_decided;
