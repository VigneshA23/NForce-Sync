# Live Data Providers

Live data lets the assistant ground an answer in the asker's own current numbers — "is my EOD for
today submitted?", "how many approvals are pending?" — without ever seeing anyone else's.

## The self-scoping guarantee

**Every provider passes only the caller's own `userId` or `email` into an existing Sync service
method.** Never an id extracted from the question, never a parameter supplied by the model. This
is the load-bearing safety property of this package, and it's verified structurally, not just by
convention:

- `DataProviderSafetyTest` (`backend/src/test/java/.../ai/data/DataProviderSafetyTest.java`) mocks
  every backing service and, for each of the 17 providers, asserts with Mockito the **exact**
  method call with the **exact** self-scoped argument (`context.email()` or `context.userId()`),
  then calls `verifyNoMoreInteractions()` on that mock. A provider that starts passing a
  model-supplied or wrong id fails this test immediately, not eventually.
- This matters especially in Sync because several of the underlying services have **no
  authorization of their own** — `UtilizationController`/`UtilizationService` do no scoping at
  all, and `EodAccessPolicy.canRead` allows any MANAGER/PM/DM/LEADERSHIP to read *any* entry. The
  assistant cannot rely on the service layer to reject an unscoped call; it must never make one.

## Selection algorithm (`AssistantDataService`)

1. Filter providers to those whose `audiences()` contains the caller's role.
2. Score by relevance: a provider whose `modules()` overlaps the modules implied by the retrieved
   knowledge, or by the current page (0.75 weight), is eligible.
3. Take at most 3 providers per turn.
4. Round-robin across provider "families" (the `.`-prefix of the id, e.g. `eod.*`, `blockers.*`) so
   one chatty module can't crowd out every slot.
5. Call each selected provider. **A single provider's failure only drops that section from the
   prompt — it never fails the turn.**

## The 17 providers

| Provider id | Audience(s) | Module(s) | Self-scoped call |
|---|---|---|---|
| `eod.today` | EMPLOYEE, MANAGER | eod | `EodService.listEntries(null, today, today, false, context.email())` |
| `eod.recent` | EMPLOYEE, MANAGER | eod | `EodService.listEntries(null, today-14, today, true, context.email())` → status counts, missing dates |
| `eod.time-adjustment` | EMPLOYEE, MANAGER | eod | `EodService.getTimeAdjustmentContext(today, context.email())` |
| `clarification.mine` | EMPLOYEE, MANAGER | eod | `EodClarificationService.listForEmployee(context.email(), true)` |
| `clarification.lead` | MANAGER | eod, approvals | `EodClarificationService.listForLead(context.email(), true)` |
| `clarification.pm` | PM | eod, approvals | `EodClarificationService.listForPm(context.email(), true)` |
| `utilization.mine` | EMPLOYEE, MANAGER | utilization | `UtilizationService.getForEmployee(context.userId(), from, to)` — **always `userId()`, never anything derived from the question** |
| `projects.mine` | EMPLOYEE | projects | `EmployeeProjectService.listMyProjects(context.email(), today)` |
| `projects.lead` | MANAGER | projects | `TeamLeadProjectService.listMyProjects(context.email(), today, null)` |
| `blockers.mine` | EMPLOYEE | blockers | `EmployeeService.getBlockers(context.userId(), from, to)` → counts by status |
| `blockers.team` | MANAGER | blockers | `TeamLeadService.getBlockers(from, to, context.email(), false, null)` → counts |
| `blockers.pm` | PM | blockers | `PmBlockersService.getBlockers(context.email(), from, to, null, null, null)` → counts |
| `approvals.summary` | MANAGER, PM, SUPERADMIN | approvals | `ApprovalService.getPendingForActor(context.email(), null, null, null, null)` → pending/oldest/escalated counts — the one provider that returns cross-person **counts only**, never any individual's data |
| `team.summary` | MANAGER | dashboard | `TeamLeadService.getSummary(today, today, context.email(), null)` → headline numbers |
| `project-dashboard.summary` | PM | dashboard, projects | `ProjectDashboardService.getSummary(context.email(), from, to, null, null, null, null)` → headline numbers |
| `planned-vs-actual.summary` | PM | projects | `PlannedVsActualService.getSummary(context.email(), from, to, null, null)` |
| `executive.summary` | SUPERADMIN | dashboard | `ExecutiveDashboardService.getDashboard(context.email(), from, to)` → headline KPIs |

ADMIN, DM, FINANCE and LEADERSHIP have **no** live-data providers in this release — ADMIN's
domain (users, org masters) isn't asker-personal data in the same way, and DM/FINANCE/LEADERSHIP
are placeholder-only roles in Sync itself today.

## Adding a new provider

1. Implement `AssistantDataProvider` (`id()`, `title()`, `audiences()`, `modules()`, and the fetch
   method) as a package-private nested static class, following the existing files' pattern — grep
   any of the classes above for the shape.
2. Pass **only** `context.email()` or `context.userId()` into the backing service call — never a
   parameter parsed from the question or supplied by the model.
3. Cap returned rows (existing providers return summaries/counts, or at most ~5 rows) and never
   include another person's name in a manager-facing provider — see I8 in the plan: manager-facing
   providers return counts and dates only.
4. Add the provider to whatever list wires it into `AssistantDataService` (mirror an existing
   `*DataProviders` class).
5. **Add a `DataProviderSafetyTest` case** verifying the exact self-scoped call and
   `verifyNoMoreInteractions()`. A provider without this test is not considered done — this is the
   whole safety property, not a nice-to-have.
6. If the underlying service has no authorization of its own (check first — several don't, see
   above), the provider's self-scoping is the *only* thing standing between "shows my own data"
   and "shows anyone's data." Treat that PR with the scrutiny of an authorization change, because
   it is one.
