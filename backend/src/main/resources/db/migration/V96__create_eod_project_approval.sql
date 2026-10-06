CREATE TABLE eod_project_approval (
    id            BIGSERIAL PRIMARY KEY,
    eod_entry_id  BIGINT NOT NULL REFERENCES eod_entry(id),
    project_id    BIGINT NULL REFERENCES project(id),
    approver_id   BIGINT NULL REFERENCES app_user(id),
    approver_type VARCHAR(30) NOT NULL
        CHECK (approver_type IN ('LEAD','REPORTING_MANAGER','PM','ADMIN_GROUP','AUTO_APPROVED')),
    status        VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    frozen_at     TIMESTAMPTZ NOT NULL,
    acted_at      TIMESTAMPTZ NULL,
    comment       TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_epa_entry           ON eod_project_approval(eod_entry_id);
CREATE INDEX idx_epa_approver_status ON eod_project_approval(approver_id, status)
    WHERE status = 'PENDING';
CREATE INDEX idx_epa_project         ON eod_project_approval(project_id);
