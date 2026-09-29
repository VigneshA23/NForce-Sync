ALTER TABLE eod_entry DROP CONSTRAINT eod_entry_status_check;

ALTER TABLE eod_entry ADD CONSTRAINT eod_entry_status_check
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_APPROVED','REJECTED','MISSED'));
