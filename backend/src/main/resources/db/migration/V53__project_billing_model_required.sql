-- Billing model becomes mandatory on a project: the New/Edit Project form no longer offers a
-- blank choice, so the column should not permit one either.
--
-- Five projects predate the Billing Models master and have no model. They are backfilled along the
-- convention the other three already follow -- a client-bearing type bills, an internal one does
-- not -- keyed off project_type.requires_client rather than a type name, so renaming a type cannot
-- change what this migration meant.

UPDATE project p
   SET billing_model_id = (
        SELECT b.id FROM billing_model b
         WHERE b.name = CASE WHEN t.requires_client THEN 'Billable' ELSE 'Non-Billable' END
       )
  FROM project_type t
 WHERE t.id = p.project_type_id
   AND p.billing_model_id IS NULL;

-- Aborts the migration if any row is still unmapped (a missing seed model), which is the intent:
-- better a failed startup than a silently half-applied rule.
ALTER TABLE project ALTER COLUMN billing_model_id SET NOT NULL;
