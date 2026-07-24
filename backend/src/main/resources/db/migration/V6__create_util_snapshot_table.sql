 CREATE TABLE util_snapshot (
    id                        BIGSERIAL       PRIMARY KEY,
    employee_id               BIGINT          NOT NULL REFERENCES app_user(id),
    snapshot_date             DATE            NOT NULL,
    available_hours           NUMERIC(5,2)    NOT NULL,
    approved_productive_hours NUMERIC(5,2)    NOT NULL,
    billable_hours            NUMERIC(5,2)    NOT NULL,
    non_billable_hours        NUMERIC(5,2)    NOT NULL,
    bench_hours               NUMERIC(5,2)    NOT NULL,
    idle_hours                NUMERIC(5,2)    NOT NULL,
    utilization_pct           NUMERIC(7,2)    NULL,
    computed_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, snapshot_date)
);

CREATE INDEX idx_util_snapshot_employee ON util_snapshot(employee_id);
CREATE INDEX idx_util_snapshot_date ON util_snapshot(snapshot_date);
