-- V26: make a project's kickoff date and type mandatory, and order-check its dates.
--
-- start_date marks when a project officially begins and is needed for tracking, reporting and
-- allocation, so it becomes NOT NULL. end_date stays nullable on purpose: most real projects
-- (ongoing internal work, retainers) have no agreed finish at creation time. A NULL end_date IS
-- the "ongoing" signal — no separate duration flag is stored, since that would duplicate the
-- fact and could then contradict it. The UI derives the label from end_date instead.
--
-- project_type becomes NOT NULL with a CHECK: the New Project form shows Client Name only for
-- CLIENT projects, so the type has to be present for that rule to be well defined.
--
-- Verified safe before writing: 0 rows with a null start_date, 0 with a null project_type, and
-- every existing value is already CLIENT or INTERNAL.

ALTER TABLE project ALTER COLUMN start_date   SET NOT NULL;
ALTER TABLE project ALTER COLUMN project_type SET NOT NULL;

ALTER TABLE project
    ADD CONSTRAINT project_type_check
    CHECK (project_type IN ('CLIENT','INTERNAL'));

ALTER TABLE project
    ADD CONSTRAINT project_date_order_chk
    CHECK (end_date IS NULL OR end_date >= start_date);

-- Deliberately NOT enforcing "CLIENT implies a client name" here: project id 5 ('TEST PROJECT')
-- is CLIENT with no client name, so the constraint could not be applied without editing data.
-- ProjectService enforces that rule for every create and update instead.
