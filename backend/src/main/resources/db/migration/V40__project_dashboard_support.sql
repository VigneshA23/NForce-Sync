-- V40: data-model support for the PM Project Dashboard.
--
-- allocation_pct: Allocation was simplified in V29 to drop any percentage concept. The Project
-- Dashboard needs a per-resource allocation percentage for planned-utilization math, so it is
-- reintroduced here. Existing rows default to 100 — every allocation created before this feature
-- existed was implicitly full-time, so that default keeps prior data meaningful without a backfill.
ALTER TABLE allocation
    ADD COLUMN allocation_pct SMALLINT NOT NULL DEFAULT 100
    CHECK (allocation_pct BETWEEN 1 AND 100);

-- project_type_check (V26) only allowed CLIENT/INTERNAL. The dashboard's project management
-- module needs three more categories. Widening the CHECK is backward compatible: every existing
-- value (CLIENT, INTERNAL) remains valid.
ALTER TABLE project DROP CONSTRAINT project_type_check;

ALTER TABLE project
    ADD CONSTRAINT project_type_check
    CHECK (project_type IN ('CLIENT', 'INTERNAL', 'PRODUCT_DEVELOPMENT', 'SUPPORT', 'BENCH'));
