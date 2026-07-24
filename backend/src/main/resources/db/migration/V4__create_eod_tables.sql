-- V4: EOD entry and task tables

CREATE TABLE eod_entry (
    id              BIGSERIAL    PRIMARY KEY,
    employee_id     BIGINT       NOT NULL REFERENCES app_user (id),
    entry_date      DATE         NOT NULL,
    status          VARCHAR(30)  NOT NULL DEFAULT 'DRAFT'
                    CONSTRAINT eod_entry_status_check
                    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CHANGES_REQUESTED','MISSED')),
    work_location   VARCHAR(100) NULL,
    next_day_plan   TEXT         NULL,
    remarks         TEXT         NULL,
    submitted_at    TIMESTAMPTZ  NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eod_entry_employee_date UNIQUE (employee_id, entry_date)
);

CREATE TABLE eod_task (
    id               BIGSERIAL    PRIMARY KEY,
    eod_entry_id     BIGINT       NOT NULL REFERENCES eod_entry (id) ON DELETE CASCADE,
    project_id       BIGINT       NULL REFERENCES project (id),
    task_category_id BIGINT       NULL REFERENCES task_category (id),
    description      TEXT         NULL,
    hours            NUMERIC(5,2) NULL,
    task_status      VARCHAR(30)  NOT NULL DEFAULT 'COMPLETED'
                     CONSTRAINT eod_task_status_check
                     CHECK (task_status IN ('COMPLETED','IN_PROGRESS','BLOCKED','NOT_STARTED')),
    is_billable      BOOLEAN      NOT NULL DEFAULT TRUE,
    blocker_reason   TEXT         NULL,
    support_needed   TEXT         NULL,
    CONSTRAINT blocked_requires_reason
        CHECK (task_status != 'BLOCKED' OR blocker_reason IS NOT NULL)
);
