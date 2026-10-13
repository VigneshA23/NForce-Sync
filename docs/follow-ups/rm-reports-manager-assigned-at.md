# Add `manager_assigned_at` + Missing EOD tab for RM Reports

**Status:** proposed follow-up. Split out of "My Reporting Team > Reports" on purpose; not started.
**Needs:** a shared-DB migration (own approval).

## Why

My Reporting Team > Reports ships with the **EOD by employee** tab only. A **Missing EOD** tab for a reporting
manager (RM) needs to know *since when* a person has reported to the RM, otherwise a newly assigned RM
inherits every miss from before the assignment. Nothing records that date today:

- `app_user.manager_id` is the live manager only; there is no "since" column and no manager history table.
- `eod_entry.manager_id` is a snapshot set at submission (V57) — it cannot exist for a **missing** day, because
  a missing day has no entry.
- The only trace of a reassignment is a generic `APP_USER` / `UPDATE` audit row (before/after JSON) and the
  `MANAGER_CHANGED` notification ("Effective Date: today"). Recovering the date from the audit log means parsing
  JSON, has gaps for old data and imports, and was ruled out.

## Scope

### 1. Migration (next free `V<n>`; do not reuse a held number)
- `ALTER TABLE app_user ADD COLUMN manager_assigned_at DATE;`
- Backfill (one-off, in the same migration), best available evidence first:
  1. latest `audit_log` row of entity `APP_USER` for the user where `before.manager.id` is different from
     `after.manager.id` -> that row's date;
  2. otherwise, for a user whose manager has never changed, `joining_date`, falling back to `created_at::date`;
  3. otherwise `NULL`.
  Review the backfill result before applying to the shared DB (count of users per branch of the rule; list any
  user resolved by rule 3).
- No index needed (read per user, small table).

### 2. Set it on every manager change
- `UserService` update path (where `managerChanged` is already computed): when the manager id actually changes,
  set `manager_assigned_at = today`; when the manager is cleared, set `NULL`.
- Create-user path: set it to the creation date when a manager is given at creation.
- Any bulk import / script that sets `manager_id` must go through the same code or set the column.
- Unit tests: change manager -> date moves; save with the same manager -> date unchanged; clear manager -> `NULL`.

### 3. Missing EOD for RM Reports
- Source: current ACTIVE direct reports only (`ReportingScopeService.directReportIds`) — a snapshot can't exist
  for missing days.
- Same working-day / leave / holiday logic as `TeamMissingEodReportService` (reuse it; do not copy).
- **Clamp the range per employee:** effective start = `max(requested from, manager_assigned_at)`; when
  `manager_assigned_at` is `NULL`, fall back to the requested `from` and show no clamp.
- Endpoint under `/api/my-reports` (`missing-eod`, plus remind endpoints if the PM/Lead tab has them — decide
  whether RMs may send reminders); same gate and 403 rules as the EOD report.
- Frontend: add `'missing'` to `RM_REPORT_SOURCE.tabs` (`pages/reports/eodReportSources.ts`) and give
  `MissingEodReport` a data source the way `EodByEmployeeReport` has one. The tab bar appears by itself once a
  source lists more than one tab — no role checks.

## Acceptance
- Reassign A from RM1 to RM2 on day D: RM2's Missing EOD shows A's misses only from D onward; RM1 no longer
  lists A.
- A brand-new report assigned today shows no past misses.
- A user with no direct reports gets 403 and no tab.
- Backfill report reviewed and attached before the migration runs on the shared DB.

## Out of scope / related
- Server-side paging for all three report endpoints (PM, Lead, RM) — separate ticket.
- Extracting the duplicated row-building code shared by `EodByEmployeeReportService`,
  `TeamEodByEmployeeReportService` and `RmEodByEmployeeReportService` — separate refactor.
