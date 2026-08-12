-- An employee may not hold two allocations to the same project over overlapping dates. This is the
-- guard V29 named as the natural replacement for the allocation_pct ceiling it dropped:
--   "A unique employee+project guard over overlapping date ranges is the natural replacement, but
--    that is new behaviour and is deliberately not introduced here."
--
-- Non-overlapping re-assignment stays legal: leaving a project and rejoining later is two rows.

-- 1. Remove rows that already violate the rule, keeping the lowest id of each overlapping pair, so
--    the constraint below can be created. Overlap-based rather than "same pair", so a genuine later
--    re-assignment is left alone. Windows are inclusive at both ends and a NULL effective_to means
--    open-ended, standing in as 9999-12-31 (mirrored by Allocation.OPEN_ENDED in Java).
--
--    Nothing FK-references allocation and EOD rows join on project rather than an allocation, so
--    this loses no logged history.
DELETE FROM allocation a
      USING allocation b
      WHERE a.employee_id = b.employee_id
        AND a.project_id  = b.project_id
        AND a.id > b.id
        AND a.effective_from <= COALESCE(b.effective_to, DATE '9999-12-31')
        AND COALESCE(a.effective_to, DATE '9999-12-31') >= b.effective_from;

-- 2. Durable backstop. AllocationService returns a friendly 409 before reaching here; this catches
--    what the service cannot see — two concurrent requests, or SQL run by hand.
--
--    A plain UNIQUE cannot express a temporal rule. In an inclusive daterange a NULL upper bound is
--    unbounded, which is exactly what an open-ended allocation means, and because daterange is
--    discrete, two merely touching windows ([01-07,31-07] and [01-08,)) do not overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE allocation
    ADD CONSTRAINT allocation_no_overlap
    EXCLUDE USING gist (
        employee_id WITH =,
        project_id  WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    );
