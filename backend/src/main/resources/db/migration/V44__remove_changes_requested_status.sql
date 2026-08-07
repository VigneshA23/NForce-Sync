-- Remove the CHANGES_REQUESTED entry status. REJECTED already returns an entry to the employee
-- for edit and resubmit (EodEntry.isEditable), so the two states were functionally identical from
-- the employee's side. Approvals now offers Approve / Reject only.
--
-- Numbered V44: the live DB was at V43 while this repo's files stopped at V40 (V41-V43 were
-- applied from working copies whose .sql was never committed). With validate-on-migrate: false
-- Flyway silently SKIPS any file at or below the recorded version and the app then dies at boot
-- with "missing column". See backend/CLAUDE.md.

-- The CHECK constraint names the allowed values, so it must be replaced, not just left in place.
ALTER TABLE eod_entry DROP CONSTRAINT IF EXISTS eod_entry_status_check;

-- 2 rows at the time of writing. REJECTED is the equivalent editable state, so their owners keep
-- exactly the same ability to correct and resubmit.
UPDATE eod_entry SET status = 'REJECTED' WHERE status = 'CHANGES_REQUESTED';

ALTER TABLE eod_entry
    ADD CONSTRAINT eod_entry_status_check
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MISSED'));

-- approval_action is DELIBERATELY untouched. Its 7 REQUEST_CHANGES rows are an audit trail of
-- decisions managers actually made; rewriting them to REJECT would make the log assert something
-- that never happened. ApprovalAction.Action keeps the value as read-only legacy so those rows
-- still deserialize, while the endpoint and UI that created them are gone.
--
-- notification rows (5 of type EOD_CHANGES_REQUESTED) are likewise untouched: notification.type
-- is a plain VARCHAR of historical message text, not an enum.
