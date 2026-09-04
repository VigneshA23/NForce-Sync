-- Part of the Billable/Non-Billable classification removal.
--
-- Removes the Billing Model Organization Master entirely, per explicit product decision: even
-- though the master's five seeded rows (Billable, T & M, Fixed Bid, Internal, Non-Billable)
-- included two unrelated commercial-model options alongside the literal Billable/Non-Billable
-- labels, and nothing in code string-matched those names (only billing_model.is_active gated
-- ProjectDto.billableAllowed(), also now removed), the decision was to drop the whole concept
-- rather than keep a differently-scoped "commercial model" master alive under the same table.
--
-- project.billing_model_id is NOT NULL (V53) — every existing project has a value, so no backfill
-- is needed before dropping the column. The FK is dropped with the column; the table drop follows.

ALTER TABLE project DROP COLUMN billing_model_id;
DROP TABLE billing_model;
