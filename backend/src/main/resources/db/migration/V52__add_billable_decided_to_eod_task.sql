-- Local-only migration: verify against the real DB's `flyway_schema_history`
-- (SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1)
-- before this is ever applied to a shared/Neon database — do not assume V52 is
-- actually next there just because local files stop at V51.
--
-- Tracks whether a Team Lead has explicitly decided the billable flag on a task
-- during approval, so the approval gate can require an explicit decision on every
-- billable-eligible task rather than trusting whatever the employee's row defaulted
-- to. Defaults to FALSE for all existing rows (including approved history) — those
-- were decided, if at all, under the old whole-entry ApprovalAction.billableOverride
-- mechanism, not this per-task one, and are not retroactively re-gated since the
-- gate only ever applies to entries still in SUBMITTED status.
ALTER TABLE eod_task
    ADD COLUMN billable_decided BOOLEAN NOT NULL DEFAULT FALSE;
