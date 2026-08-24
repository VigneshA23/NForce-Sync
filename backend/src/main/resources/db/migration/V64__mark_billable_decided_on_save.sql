-- Companion backfill for the change in EodService.buildTask, which now sets
-- eod_task.billable_decided = TRUE as each task is saved.
--
-- Background: V52 added the column defaulting to FALSE and V56 backfilled the rows pending at
-- that moment. Nothing set it on the write path though, so every submission created since V56
-- arrived undecided again — the reviewer saw the Billable checkbox already ticked (it renders
-- is_billable, which the project's billing eligibility fills in correctly) while the approval
-- gate read billable_decided and disabled Approve. The only way through was to click the box
-- twice to land back on the value it already held.
--
-- is_billable is derived, not guessed: EodService.buildTask forces it from project eligibility
-- on every save, and a Leave row or a non-billable project is pinned to FALSE there. So there
-- was never an open question for the reviewer to answer — only a flag nobody was setting.
--
-- Scoped to DRAFT and SUBMITTED. APPROVED/REJECTED rows stay as they are: the gate only ever
-- consults entries still in SUBMITTED, so rewriting settled history would claim a per-task
-- decision that never happened — the same reasoning V56 applied. DRAFT is included because a
-- draft saved before this change would otherwise carry FALSE into its eventual submission.
--
-- Idempotent — re-running only touches rows that are still FALSE.
UPDATE eod_task t
SET billable_decided = TRUE
FROM eod_entry e
WHERE t.eod_entry_id = e.id
  AND e.status IN ('DRAFT', 'SUBMITTED')
  AND NOT t.billable_decided;
