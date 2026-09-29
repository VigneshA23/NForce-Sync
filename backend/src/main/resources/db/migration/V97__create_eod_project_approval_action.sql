CREATE TABLE eod_project_approval_action (
    id       BIGSERIAL PRIMARY KEY,
    piece_id BIGINT NOT NULL REFERENCES eod_project_approval(id),
    actor_id BIGINT NOT NULL REFERENCES app_user(id),
    action   VARCHAR(20) NOT NULL
        CHECK (action IN ('APPROVED','REJECTED')),
    comment  TEXT NULL,
    acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
