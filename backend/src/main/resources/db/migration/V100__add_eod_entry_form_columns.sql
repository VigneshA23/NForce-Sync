ALTER TABLE eod_entry
    ADD COLUMN entry_form      VARCHAR(20) NOT NULL DEFAULT 'PROJECT_GROUPED'
        CHECK (entry_form IN ('PROJECT_GROUPED','PLAIN_LOG')),
    ADD COLUMN log_summary     TEXT NULL,
    ADD COLUMN log_total_hours NUMERIC(5,2) NULL;
