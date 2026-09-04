-- Part of the Billable/Non-Billable classification removal.
--
-- project_type.billable_allowed was the flag ProjectDto.billableAllowed() consulted to decide
-- whether an EOD task on a project of this type could be marked billable. That whole mechanism
-- is gone (see V69 for eod_task.is_billable/billable_decided), so the flag has nothing left to
-- drive. requires_client — the type's other flag — is unrelated and stays untouched.

ALTER TABLE project_type DROP COLUMN billable_allowed;
