-- V63: index to support the new "employee's total allocation % cannot exceed 100%" check
-- (AllocationRepository.findOverlappingForEmployee), which filters by employee_id alone across
-- every project — unlike the existing V54 GIST exclusion constraint, which is keyed on
-- (employee_id, project_id, daterange) and so isn't a useful lookup path for an employee-only scan.
--
-- Purely additive: no data is read, changed, or constrained by this migration.
CREATE INDEX IF NOT EXISTS idx_allocation_employee_id ON allocation (employee_id);
