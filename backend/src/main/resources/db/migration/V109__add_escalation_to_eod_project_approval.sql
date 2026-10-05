ALTER TABLE eod_project_approval
    ADD COLUMN escalated_at  TIMESTAMPTZ NULL,
    ADD COLUMN escalated_to_id BIGINT     NULL REFERENCES app_user(id);

CREATE INDEX idx_epa_escalation_check
    ON eod_project_approval (approver_type, frozen_at)
    WHERE status = 'PENDING' AND superseded_at IS NULL AND escalated_at IS NULL;
