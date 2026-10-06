-- Fixes drift between this branch's schema history and the shared dev database: an
-- out-of-band change ("restore billable and billing model columns", applied directly to the
-- database — no corresponding migration file exists on any branch of this repo) re-added
-- project.billing_model_id as NOT NULL after V72 deliberately dropped the whole Billing Model
-- concept. No entity, DTO, or service in this codebase populates that column any more, so every
-- project creation (Project Manager or Super Admin) violated the NOT NULL constraint and
-- surfaced as an unhandled 500.
--
-- Relaxing the column to nullable un-blocks project creation without losing any existing data
-- and without reintroducing the Billing Model feature into application code, which remains
-- fully removed per V72's documented product decision.
-- No-op on fresh databases (billing_model_id was dropped by V72 and never re-added).
-- On the shared dev DB, an out-of-band change re-added it as NOT NULL after V72; this
-- relaxes it so project creation does not surface a 500.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project' AND column_name = 'billing_model_id'
  ) THEN
    ALTER TABLE project ALTER COLUMN billing_model_id DROP NOT NULL;
  END IF;
END $$;
