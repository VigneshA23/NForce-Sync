-- V25: mark an allocation as the employee's PRIMARY or SECONDARY project.
--
-- Numbered 25 because V21-V24 were applied to the shared database from another
-- working copy and their .sql files are not in this repo (V22 "fix employee code
-- trigger", V23 "partial unique email for soft delete", V24 "employee code allow
-- 8digit format"). Flyway silently skips any local file at or below the recorded
-- version, so this must stay above 24.
--
-- `allocation` is already one row per (employee, project), so splitting someone
-- across two projects is two rows -- the only thing missing was which of them is
-- the main assignment. The PM "New Allocation" form now captures a primary project
-- plus an optional secondary one in a single submission, and both rows are written
-- in one transaction.
--
-- The DEFAULT exists only to keep the column safely NOT NULL; the table is empty at
-- the time of this migration, so nothing is backfilled.
--
-- Note: "at most one PRIMARY per employee" is deliberately NOT a database constraint.
-- It is a temporal rule (it may only hold for overlapping effective_from/effective_to
-- windows), which a unique index cannot express correctly. AllocationService enforces
-- the allocation totals instead.
ALTER TABLE allocation
    ADD COLUMN allocation_type VARCHAR(20) NOT NULL DEFAULT 'PRIMARY'
    CONSTRAINT allocation_type_check CHECK (allocation_type IN ('PRIMARY','SECONDARY'));
