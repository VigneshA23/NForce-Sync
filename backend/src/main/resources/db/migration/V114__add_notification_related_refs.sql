-- Structured pointers for "Open related page" on actionable notifications (first user: the PM's
-- "Approval escalated to you"). All nullable: notifications created before this migration, and types
-- with no related page, simply carry none. The frontend hides the button when they are absent; the
-- message text is never parsed to guess them.
ALTER TABLE notification
    ADD COLUMN related_employee_id BIGINT NULL,
    ADD COLUMN related_piece_id    BIGINT NULL,
    ADD COLUMN related_eod_id      BIGINT NULL,
    ADD COLUMN related_eod_date    DATE   NULL;
