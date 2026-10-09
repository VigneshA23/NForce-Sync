-- Records WHICH approver identity opened a clarification round, as a point-in-time snapshot.
-- opened_by_id is whoever clicked the button (could be a Super Admin); opened_by_approver_id is
-- that same user only when they were a current piece approver / escalatee on the entry at that
-- moment, otherwise NULL. It is an audit trail and a last-resort notification target only —
-- access to a thread is always evaluated live against the entry's current-cycle approval pieces
-- (eod_project_approval.approver_id / escalated_to_id), never against this column, so a
-- reassigned approver loses access immediately.
ALTER TABLE eod_clarification
    ADD COLUMN opened_by_approver_id BIGINT REFERENCES app_user(id);

-- Backfill: before this change only approver-class users (RM / lead / PM / Super Admin) could
-- open a round, so opened_by_id is the best available answer for existing rows.
UPDATE eod_clarification SET opened_by_approver_id = opened_by_id;
