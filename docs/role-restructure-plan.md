# NForce Sync — Role Restructure Implementation Plan

**Branch:** `vigneshdev`
**Backup branch:** `backup/pre-role-restructure-2026-09-28` (pushed to origin)
**DB export:** manual pg_dump taken 2026-09-28 — confirm file exists before Phase 8
**Source doc:** `docs/NForce_Sync_Approvals_and_Roles_Team_Guide.docx` (v1.0)
**Status:** All phases complete as of 2026-10-06 (vigneshdev branch). V110 is the current top migration.

---

## Security

**Credentials exposed in git history — password rotation required.**

`application.yml` previously contained real Neon database credentials (URL, username, password)
and the JWT secret in plain text. These values exist verbatim in every commit from project
inception up to and including the commit where this line was added. Anyone who can read the git
history can see them.

**Required actions (do this before the next deploy):**

1. **Rotate the Neon database password** — generate a new password in the Neon console, update
   `application-local.yml` locally, and set `SPRING_DATASOURCE_PASSWORD` in Railway.
2. **Rotate the JWT secret** — generate a new random string (minimum 32 chars), update
   `application-local.yml`, and set `JWT_SECRET` in Railway. All existing sessions will be
   invalidated (users will have to log in again — this is expected and safe).
3. **Do not print either value anywhere** — use masked output in logs and docs.

`application.yml` now uses `${SPRING_DATASOURCE_URL}`, `${SPRING_DATASOURCE_USERNAME}`,
`${SPRING_DATASOURCE_PASSWORD}`, and `${JWT_SECRET}` (no defaults; app fails clearly at startup
if missing). Local dev values live only in the gitignored `application-local.yml`. Railway uses
its own environment variables panel.

---

## Known Issues — resolved

**Fresh database can now be built from V1.** `beforeMigrate.sql` (Flyway SQL callback, checked in
at `backend/src/main/resources/db/migration/beforeMigrate.sql`) runs before any migration and
creates `business_rule_config` if it does not exist. The callback is a no-op on Neon (table
already present). New environments provisioned from V1 will apply the callback first, so V33
ALTER never fails on a missing table.

---

## What was built (final state, 2026-10-05)

| Area | What shipped |
|------|-------------|
| Roles | 4 roles: EMPLOYEE, PM, ADMIN, SUPERADMIN. MANAGER/HR/DM/FINANCE/LEADERSHIP removed (V106/V107). |
| Team Lead | Capability, not a role. Any active non-PM user assigned as `project.lead_id`. EOD approval, team dashboard, reports scoped to the project. |
| Reporting Manager | `manager_id` FK on `app_user`. Any active user can be a reporting manager. My Reporting Team nav section shown when `hasDirectReports`. |
| EOD approval | Per-piece approval via `eod_project_approval` table. LEAD piece → escalates to PM after SLA hours. PM piece runs alongside LEAD. REPORTING_MANAGER piece for plain-log hours over limit. |
| Escalation | Hourly `EscalationScheduler`. LEAD pieces with no action after `escalation_sla_hours` escalate to PM as an additional approver. Manual trigger at `/api/v2/approvals/admin/trigger-escalation` (SUPERADMIN + `@PreAuthorize`, writes `audit_log` row). |
| Secrets | DB credentials and JWT secret moved to env vars (`SPRING_DATASOURCE_*`, `JWT_SECRET`). Local values in gitignored `application-local.yml`. |
| Fresh DB | `beforeMigrate.sql` callback ensures `business_rule_config` exists before V33. |
| Tests | `SyncApplicationTests` and `EodReminderSchedulerIT` skip unless `NFORCE_LIVE_DB_IT=true`. `EodReminderSchedulerIT` creates its own users dynamically — no hardcoded IDs. |
| AI knowledge | YAMLs updated: removed DM/Finance/Leadership role entries. AI correctly describes 4 roles + Team Lead capability + Reporting Manager relationship. |

---

## Management override (addendum)

The guide's section 2 and 9 stated "only Employees submit EODs." Management has overridden this:
**Every role except Super Admin submits an EOD.** PM, Admin, and Reporting Manager use a simpler
plain-log form (free text + hours, no project grouping). All other guide decisions stand as written.

---

## Decided: design decisions

All questions resolved. Decisions recorded inline per phase below.

| # | Decision |
|---|---|
| 1 | Plain log storage: new columns on `eod_entry` (Option A) |
| 2 | Reporting Manager approval queue: small queue for lead's-own-project pieces and non-project hours over the limit; view-only otherwise (Option A) |
| 3 | No Reporting Manager at submit time: route to Admin group fallback (Option A) |
| 4 | Clarification scoping: per piece — open clarification on one piece does not block another (Option A) |
| 5 | SLA escalation: per piece, each piece has its own escalation clock from its `frozen_at` timestamp |
| 6 | Backfill strategy: APPROVED → pull real approver + timestamp from `approval_action`; REJECTED → pull real comment; SUBMITTED → route fresh under current rules |
| 7 | Plain log validations: no work_location, no next_day_plan, cutoff time still applies, no allocation filter on reminders |
| 8 | Utilization: Employee-only (Option B) — PM/Admin/Reporting Manager plain logs never touch utilization snapshots or dashboards |
| 9 | Plain log route: `/eod/submit`, component chosen by role (Option A) |
| 10 | Allocation cap: per-project 1–100, no change to existing behaviour |
| 11 | Phase 6 ordering: accept DM as valid Reporting Manager temporarily in Phase 6; tighten to REPORTING_MANAGER only in Phase 8 (Option A) |
| 12 | Plain log read access: Reporting Manager sees direct reports only; Admin sees all entries; Super Admin sees everything; PM sees only entries on their own projects |
| 13 | Phase 8 date/time: TBD — decide once Phases 1–7 are verified in dev, after-hours window, announce to full team |

---

## Pre-work: before writing any migration

Run this on the shared Neon database and number all new migrations above the result:

```sql
SELECT version, description FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
```

CLAUDE.md records V95 as of 2026-09-24. Other branches may have moved it since — always re-query.

---

## Ordering principle

Phases 1–5 are purely additive (new tables, new columns, new response fields — no behaviour change).
Phases 6–7 change permissions and UI but don't break old flows.
Phase 8 is the one-way role migration — after-hours, all old flows must be verified first.
Phase 9 removes dead code.

---

## Phase 1 — Database foundations

**Risk: Low. Purely additive schema. No behaviour change.**

### Migrations

**VXX — per-project approval table**

```sql
CREATE TABLE eod_project_approval (
    id            BIGSERIAL PRIMARY KEY,
    eod_entry_id  BIGINT NOT NULL REFERENCES eod_entry(id),
    project_id    BIGINT NULL REFERENCES project(id),  -- NULL = non-project or plain-log piece
    approver_id   BIGINT NULL REFERENCES app_user(id), -- NULL = admin-group fallback
    approver_type VARCHAR(30) NOT NULL,
      -- LEAD / REPORTING_MANAGER / PM / ADMIN_GROUP / AUTO_APPROVED
    status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      -- PENDING / APPROVED / REJECTED
    frozen_at     TIMESTAMPTZ NOT NULL, -- approver resolved at submit time, never changes
    acted_at      TIMESTAMPTZ NULL,
    comment       TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_epa_entry          ON eod_project_approval(eod_entry_id);
CREATE INDEX idx_epa_approver_status ON eod_project_approval(approver_id, status)
    WHERE status = 'PENDING';
CREATE INDEX idx_epa_project        ON eod_project_approval(project_id);
```

**VXX — approval action audit trail**

```sql
CREATE TABLE eod_project_approval_action (
    id        BIGSERIAL PRIMARY KEY,
    piece_id  BIGINT NOT NULL REFERENCES eod_project_approval(id),
    actor_id  BIGINT NOT NULL REFERENCES app_user(id),
    action    VARCHAR(20) NOT NULL,  -- APPROVED / REJECTED
    comment   TEXT NULL,
    acted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**VXX — PARTIALLY_APPROVED status**

```sql
ALTER TABLE eod_entry DROP CONSTRAINT IF EXISTS eod_entry_status_check;
ALTER TABLE eod_entry ADD CONSTRAINT eod_entry_status_check
    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_APPROVED','REJECTED','MISSED'));
```

Java: add `PARTIALLY_APPROVED` to `EodEntry.Status` enum.

**VXX — non-project auto-approve limit in Business Rules**

```sql
ALTER TABLE business_rule_config
    ADD COLUMN non_project_auto_approve_hours NUMERIC(4,2) NOT NULL DEFAULT 1.0;
```

Java: add field to `BusinessRuleConfig.java`.

**VXX — plain log columns on eod_entry (decision 1: Option A)**

```sql
ALTER TABLE eod_entry
    ADD COLUMN entry_form     VARCHAR(20) NOT NULL DEFAULT 'PROJECT_GROUPED'
        CHECK (entry_form IN ('PROJECT_GROUPED', 'PLAIN_LOG')),
    ADD COLUMN log_summary    TEXT NULL,     -- plain log: free-text summary of day's work
    ADD COLUMN log_total_hours NUMERIC(5,2) NULL; -- plain log: total hours
```

`entry_form` is stored at draft creation from the submitter's role so it survives role changes.
`log_summary` and `log_total_hours` are non-null only when `entry_form = 'PLAIN_LOG'`.
Java: add `entryForm` enum field (`PROJECT_GROUPED`, `PLAIN_LOG`), `logSummary`, `logTotalHours` to `EodEntry`.

### V110 — Daily Log line items (2026-10-06)

Replaces the single summary textarea with category-based line items for PLAIN_LOG entries.

**New table: `eod_log_line`**
```sql
CREATE TABLE eod_log_line (
    id          BIGSERIAL    PRIMARY KEY,
    entry_id    BIGINT       NOT NULL REFERENCES eod_entry (id) ON DELETE CASCADE,
    category_id BIGINT       NOT NULL REFERENCES task_category (id),
    hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    description TEXT         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0
);
```

**task_category.scope** — new VARCHAR(20) column (`EMPLOYEE` | `MANAGEMENT`, DEFAULT 'EMPLOYEE').
- Old global unique index dropped; replaced by per-scope: `(scope, lower(btrim(name)))`.
- 12 MANAGEMENT categories seeded (Meetings and Calls, Reviews and Approvals, Planning and Strategy, People and 1:1s, Hiring and Interviews, Client and Stakeholder, Reporting and Analysis, Administration, Escalations and Issue Resolution, Documentation, Training and Mentoring, Travel).
- `GET /api/task-categories` defaults to `?scope=EMPLOYEE` — employee Submit EOD never receives management categories.
- `DailyLogForm` calls `?scope=MANAGEMENT` explicitly.

**Rules:**
- `log_total_hours` computed server-side as `SUM(eod_log_line.hours)` — client never sends it.
- Empty `logLines` = leave day (auto-approved).
- Legacy PLAIN_LOG entries (pre-V110) have no rows in `eod_log_line`; frontend renders a synthetic "Summary" row from `logSummary`/`logTotalHours`.
- Do NOT use `eod_task` rows for PLAIN_LOG (corrupts `EodByEmployeeReportService` which iterates `entry.getTasks()` without a PLAIN_LOG guard).

### Verification

- App boots. `flyway_schema_history` shows all new migrations.
- `SELECT * FROM eod_project_approval LIMIT 1` — table exists, empty.
- `SELECT non_project_auto_approve_hours FROM business_rule_config` — returns `1.0`.
- `SELECT entry_form, log_summary, log_total_hours FROM eod_entry LIMIT 1` — columns present, `entry_form = 'PROJECT_GROUPED'` for all existing rows.
- Submit and approve an existing-flow EOD — unchanged behaviour.

### Merge safety

Safe to merge on its own. Announce to team before merging — migrations run once on shared Neon.

---

## Phase 2 — Backend: per-project approval engine

**Risk: Medium. Old approval flow stays untouched. New endpoints are additive.**

### 2a — EodProjectApproval entity and repository

New `approval2/` sub-package. Keep old `approval/` package untouched.
Fields mirror `eod_project_approval` table. Repository methods:
- `findByApproverIdAndStatus`
- `findByEodEntryId`
- `findByProjectIdAndStatus`

### 2b — ApprovalPieceRouter

Pure function — no DB writes. Takes `EodEntry` + tasks + submitter context.
Returns list of `ApprovalPieceSpec`.

**Routing table:**

| Entry form | Task type | Approver | Type |
|---|---|---|---|
| PLAIN_LOG | (whole entry) | submitter's reporting manager | REPORTING_MANAGER |
| PLAIN_LOG | (no reporting manager) | null | ADMIN_GROUP |
| PROJECT_GROUPED | project task, employee is member | project lead (`project.pm` — pre-Phase-4 name) | LEAD |
| PROJECT_GROUPED | project task, employee is the lead | employee's reporting manager | REPORTING_MANAGER |
| PROJECT_GROUPED | non-project, ≤ `non_project_auto_approve_hours` per day | null | AUTO_APPROVED |
| PROJECT_GROUPED | non-project, above limit | employee's reporting manager | REPORTING_MANAGER |
| PROJECT_GROUPED | project task, no lead assigned | project's PM (`project.projectManager`) | PM |
| Any | any, no reporting manager set | null | ADMIN_GROUP (decision 3) |

**Plain log is always one piece** (decision 2: no auto-approve on plain log — the 1-hour limit applies only to `PROJECT_GROUPED` non-project tasks). No split.

**Reporting Manager's approval queue scope (decision 2):**
The RM receives pieces of type `REPORTING_MANAGER` only: a lead's own-project tasks and PROJECT_GROUPED non-project hours above the limit. Everything else on their pages is view-only.

### 2c — EodService.submit() — two paths

Branch on `entry.entryForm` before validation:

**PLAIN_LOG path:**
- Skip `validateLoggedDay()` (no tasks, no project/category/hours checks).
- Skip `validateTimeAdjustment()` (shift adjustment is employee-only).
- Require `log_summary` non-blank and `log_total_hours` > 0.
- Apply overtime detection: if `log_total_hours` > `standard_hours_per_day`, set `is_overtime = true` and `overtime_hours = log_total_hours − standard_hours_per_day`. Flagged for the approver; not a block.
- Cutoff time still applies (decision 7).
- No work_location, no next_day_plan required (decision 7).
- Snapshot `manager_id` = submitter's `reportingManager.id` (used for routing).

**PROJECT_GROUPED path:** existing logic, unchanged.

**No explicit role gate** on `submit()` — role is already baked into `entry.entryForm` at draft creation.

### 2d — New approval piece endpoints

Alongside old endpoints (which stay):

- `GET /api/v2/approvals/pending` — approver's pending pieces
- `POST /api/v2/approvals/pieces/{pieceId}/approve`
- `POST /api/v2/approvals/pieces/{pieceId}/reject`

Authorization: open to any authenticated user; service checks `actor.id == piece.approverId` OR actor is SUPERADMIN.

### 2e — Clarification gate (decision 4)

`requireNoOpenClarification()` scoped per piece. An open clarification on one piece does not
block approving a different piece on the same EOD.

### 2f — SLA escalation (decision 5)

Escalation clock starts from each piece's `frozen_at` (not the parent entry's `submitted_at`).
Each piece has its own clock. A piece with a fast approver escalates independently of a slow one.

### 2g — EOD entry status derivation

Recompute parent `eod_entry.status` whenever any piece transitions:

| Pieces state | Entry status |
|---|---|
| All PENDING | SUBMITTED |
| Mix of APPROVED + PENDING | PARTIALLY_APPROVED |
| Any REJECTED (others any) | REJECTED |
| All APPROVED | APPROVED |

PLAIN_LOG entries have one piece — they go directly APPROVED or REJECTED, never PARTIALLY_APPROVED.

### 2h — Utilization recompute (decision 8)

`recomputeForEntry` triggers on piece approval only when `entry.employee.role == EMPLOYEE`.
PM, Admin, and Reporting Manager plain log approvals do not touch `util_snapshot`. No dashboard change needed.

### 2i — Backfill migration (decision 6)

For each existing `eod_entry` row:

- `APPROVED`: create one piece per project found in tasks (status=APPROVED, approver from `approval_action.actor_id`, `acted_at` from `approval_action.acted_at`). Create one non-project piece if any non-project tasks exist.
- `REJECTED`: create pieces as REJECTED, comment from `approval_action.comment`.
- `SUBMITTED`: route fresh using current routing rules (ApprovalPieceRouter), create pieces as PENDING.
- `DRAFT`, `MISSED`: no pieces.
- PM, Admin, Reporting Manager historical rows: none exist — no-op for these roles (decision 6).

**Backfill risk:** runs on shared Neon. Test on a local DB copy first. Wrap in a transaction —
if it fails mid-way, roll back cleanly. Announce before merging.

### 2j — EodReminderScheduler: SUBMITS_EOD (partial update)

`EodReminderScheduler.java:76` current: `{EMPLOYEE, MANAGER}`.

Phase 2 update (before Phase 8 role rename):
```java
Set.of(EMPLOYEE, MANAGER, PM, ADMIN)
// REPORTING_MANAGER added in Phase 8 when DM is renamed
```

No allocation filter for PM/Admin reminder eligibility (decision 7) — always remind if they have no entry for the day.

Phase 8 final state (after role rename): `{EMPLOYEE, PM, ADMIN, REPORTING_MANAGER}`.

### Verification

- Submit a PROJECT_GROUPED EOD. Confirm `eod_project_approval` rows created per project + non-project piece.
- Submit where employee leads the project. Confirm piece routes to reporting manager, not the lead.
- Non-project hours ≤ 1h: piece `status=APPROVED`, `approver_type=AUTO_APPROVED`.
- Non-project hours > 1h: piece routes to reporting manager.
- Submit as PM (PLAIN_LOG). Confirm one piece, routes to PM's reporting manager, no auto-approve.
- Open clarification on piece A, approve piece B — succeeds.
- Approve a piece — parent entry transitions correctly (PARTIALLY_APPROVED if others pending).
- Utilization snapshot: approving an employee piece updates snapshot; approving a PM plain log piece does not.
- Old `GET /api/approvals/pending` — still works, returns same data as before.

### Merge safety

Old flow untouched. New endpoints additive. Backfill migration is highest risk — test locally first,
announce before merging to dev.

---

## Phase 3 — Frontend: Submit EOD, EOD History, Approvals UI

**Risk: Low. Frontend only. Old backend endpoints still live.**

### 3a — Employee form (PROJECT_GROUPED)

Tasks grouped by project, header per group showing approver name. Live 8-hour total across all groups.
After submit: per-project status chips. Rejected groups editable; approved groups locked.
Calls existing backend (pieces created automatically by Phase 2).

### 3b — Plain log form (PM, Admin, Reporting Manager) — same route `/eod/submit` (decision 9)

Component chosen by role at runtime. Fields: summary (free text, required), total hours (numeric,
required), optional notes. No project selector, no task rows, no categories, no blocker fields.
Shows approver name (submitter's Reporting Manager).
Live 8-hour reference display — reference only, not a block.
After submit: single status chip (approved / rejected / waiting). Whole entry editable on rejection.
**No project tag for version 1 — explicitly deferred. Do not build even as optional.**

### 3c — My EOD History

Employee view: per-project chips (`Alpha ✓ Beta ✗ Gamma ⏳`), `PARTIALLY_APPROVED` status display.
PM/Admin/RM view: simpler — Date | Summary excerpt | Status | Hours | Approver name.
Nav entries `eod-submit-log` and `eod-history-log` added to PM, Admin, Reporting Manager sections.

### 3d — Approvals page (Team Lead and PM)

Rebuilt as project cards. Each card: project name, employee name, task list, approve/reject buttons.
Calls `/api/v2/approvals/*` endpoints.

### 3e — PARTIALLY_APPROVED

Add to frontend status display, colour, and label logic everywhere status appears.

### 3f — Sidebar badges

`Shell.tsx` badge logic: "missing EOD" badge applies to PM, Admin, Reporting Manager roles too
(they now submit). Badge uses same missing-entry logic as employee.

### Verification

- Employee submits grouped form. Each group shows correct approver.
- PM submits plain log. Single status chip shows.
- Approve one piece — entry shows PARTIALLY_APPROVED in history.
- Reject another piece — rejected group editable, approved group locked.
- PM/Admin/RM sidebar shows Submit EOD and My EOD History nav entries.

### Merge safety

Safe on its own. Calls Phase 2 endpoints.

---

## Phase 4 — Database: column rename

**Risk: Low. Rename only, no data change.**

### Migration

```sql
ALTER TABLE project RENAME COLUMN pm_id TO lead_id;
ALTER TABLE project RENAME COLUMN project_manager_id TO pm_id;
```

### Code changes

`Project.java`:
- `pm` field → `lead`, `@JoinColumn(name = "lead_id")`
- `projectManager` field → `pm`, `@JoinColumn(name = "pm_id")`

Search and update all references:
```
grep -rn "\.getPm()\|\.getProjectManager()\|pm_id\|project_manager_id\|projectManager"
```

Update `ApprovalPieceRouter` (Phase 2): `project.getPm()` → `project.getLead()` for lead routing.

Frontend `types.ts`: update `Project` interface field names accordingly.

### Verification

- App compiles clean: `./mvnw.cmd -o compile`.
- `SELECT lead_id, pm_id FROM project LIMIT 5` — data intact.
- Submit EOD, approve piece — full flow works.

### Merge safety

Safe on its own. Announce before merging — all devs must pull and restart immediately.
Old compiled code referencing `pm_id` for the PM will be pointing at the wrong column.

---

## Phase 5 — Capabilities in `/api/auth/me`

**Risk: Low. Additive response field.**

### Changes

`UserDto` — add `capabilities` object:

```java
record Capabilities(
    List<Long> leadsProjectIds,    // projects where user is lead_id (after Phase 4)
    List<Long> managesProjectIds,  // projects where user is pm_id (after Phase 4)
    boolean    hasDirectReports    // any app_user.manager_id = this user
)
```

`AuthController.getMe()` — compute live from DB on every call (3 queries). Not stored in JWT.
Frontend `AuthContext` — parse and store capabilities.

No sidebar or routing change yet (Phase 7).

### Verification

- `GET /api/auth/me` as lead user — `capabilities.leadsProjectIds` populated.
- As employee with no lead assignment — `capabilities.leadsProjectIds = []`.
- As PM — `capabilities.managesProjectIds` populated.

### Merge safety

Safe on its own. Existing clients ignore unknown response fields.

---

## Phase 6 — Admin project controls + allocation tightening

**Risk: Medium. PMs lose project-creation and allocation-edit access.**

### Pre-flight checklist (run before this phase deploys)

- [ ] **Missing PM check:** `SELECT id, name FROM project WHERE pm_id IS NULL AND status = 'ACTIVE'`
  Assign a PM to every result manually. Do not auto-fill. Phase 6 makes PM required.
- [ ] **Reporting Manager enforcement ordering:** DM-role users are accepted as valid Reporting Managers
  in Phase 6 (temporarily). This avoids a dependency on Phase 8's rename. Tightened in Phase 8.

### 6a — Tighten ProjectController

`POST /api/projects` → `hasAnyRole('ADMIN','SUPERADMIN')` (remove PM).
`GET /api/projects/all` → keep ADMIN/SUPERADMIN/PM readable.

### 6b — Tighten AllocationController

Class-level `@PreAuthorize` → `hasAnyRole('ADMIN','SUPERADMIN')`.
New `GET /api/allocations/project/{projectId}` — readable by PM, ADMIN, SUPERADMIN (read-only view for PM).

### 6c — Lead assignment endpoints

- `PUT /api/projects/{id}/lead` — ADMIN/SUPERADMIN only.
  Validates: target user must be an allocated member on the project; target user's role is not PM;
  target user is not the project's PM (same-person check). Sends notification to new lead.
- `DELETE /api/projects/{id}/lead` — removes assignment; project reverts to PM as backup approver.

### 6d — Widen PM dropdown

`GET /api/projects/managers` — widen to return PM-role users plus ADMIN and SUPERADMIN users.

### 6e — Project close guard

Before marking project COMPLETED or INACTIVE: check no `eod_project_approval` rows are PENDING
for that project. Return 409 CONFLICT if any exist.

### 6f — Confirm and remove old allocation manager-equals-lead rule

Confirm during implementation whether `AllocationService` or `AllocationController` validates
that the employee's reporting manager equals the project's lead. If found, remove that check.

### 6g — Allocation cap (decision 10)

Per-project 1–100, no change to existing behaviour. No new validation needed.

### 6h — User creation/edit form: Reporting Manager now required for all non-SUPERADMIN

**Backend `UserService.requireValidReportingManager` — simplified rule (replaces old REQUIRED_MANAGER_ROLE map):**

```java
if (role != SUPERADMIN) {
    if (manager == null)
        throw BAD_REQUEST("Reporting Manager is required.");
    if (!Set.of(REPORTING_MANAGER, DM, ADMIN, SUPERADMIN).contains(manager.getRole()))
        // DM accepted temporarily in Phase 6; tightened to exclude DM in Phase 8
        throw BAD_REQUEST("Reporting Manager must be a Reporting Manager, Admin, or Super Admin.");
}
// SUPERADMIN: optional, same-role only (unchanged)
```

**Frontend `UserManagement.tsx`:**
- Reporting Manager field: required for all roles except SUPERADMIN.
- Dropdown: filter by `role IN ('dm', 'admin', 'superadmin')` in Phase 6; updated to
  `role IN ('reporting_manager', 'admin', 'superadmin')` in Phase 8.
- `MANDATORY_MANAGER_ROLES` constant: all roles except SUPERADMIN.

### Verification

- As PM, `POST /api/projects` → 403.
- As ADMIN, create project → succeeds.
- Set same user as both PM and lead → 400.
- Try to close project with PENDING pieces → 409.
- Create employee with no Reporting Manager → 400.
- Create PM with a DM as Reporting Manager → succeeds (Phase 6 window).

### Merge safety

Coordinate with active PMs — they lose project creation access. Announce before merging.

---

## Phase 7 — Sidebar and routes from capabilities; Reporting Manager pages

**Risk: Low. Frontend only.**

### 7a — nav.ts rebuild (capability-driven)

| Section | Appears when |
|---|---|
| `employee` | role is EMPLOYEE |
| `lead` | `capabilities.leadsProjectIds.length > 0` (any role) |
| `pm` | `capabilities.managesProjectIds.length > 0` (any role) |
| `my-reports` | `capabilities.hasDirectReports` (any role) |
| `admin` | role is ADMIN or SUPERADMIN |

### 7b — Reporting Manager pages (replaces DM nav section)

- Team Overview: search, filter, paginate list of direct reports (~50 people), utilization highs/lows,
  missing EODs, pending items.
- Team EOD Status: per-person daily status.
- Team Utilization: per person, by day or week.
- Small approval queue: REPORTING_MANAGER-type pieces only — lead's own-project pieces and
  PROJECT_GROUPED non-project pieces above the 1-hour limit. Everything else is view-only (decision 2).

### 7c — Shell.tsx badge update

Approval badge, blockers badge, eod-inbox badge: switch from `role === 'lead'` to
`capabilities.leadsProjectIds.length > 0`.
Missing-EOD badge: applies to PM, Admin, Reporting Manager too (they now submit).

### 7d — PM, Admin, Reporting Manager nav additions

Each role's existing section gets two new entries:

| Nav key | Label | Route |
|---|---|---|
| `eod-submit-log` | Submit EOD | `/eod/submit` (plain log component) |
| `eod-history-log` | My EOD History | `/eod/history` (plain log view) |

### Verification

- Employee who leads 2 projects sees employee + lead sections.
- Remove lead assignment → reload → lead section disappears.
- ADMIN who is also PM of a project sees admin + pm + eod-submit-log sections.
- DM users still see old DM pages until Phase 8 (not yet replaced).

### Merge safety

Safe on its own. Role values haven't changed yet.

---

## Phase 8 — Role changes

**Risk: HIGH — irreversible. Must run after-hours.**

### Pre-flight checklist (all items must be ticked before the migration window opens)

- [ ] **Active user count on legacy roles:**
  `SELECT role, count(*) FROM app_user WHERE role IN ('FINANCE','LEADERSHIP','DM') AND status = 'ACTIVE' GROUP BY role`
  If FINANCE or LEADERSHIP have any active users, reassign or notify them individually before proceeding.
  DM users will become REPORTING_MANAGER — confirm they are aware.

- [ ] **All non-SUPERADMIN users have a Reporting Manager assigned:**
  `SELECT id, email, role FROM app_user WHERE role != 'SUPERADMIN' AND manager_id IS NULL AND status = 'ACTIVE'`
  Assign a Reporting Manager to every result before running Phase 8.

- [ ] **DM broad-read-access usage:**
  Check with current DM-role users whether they access EOD entries for people outside their direct
  reports. Phase 8 scopes their read access to direct reports only. Warn them before the migration.

- [ ] **Phase 8 deployment window agreed:** TBD — decide once Phases 1–7 are verified in dev.
  Must be after-hours. Announce to full team. Old JWT tokens (8-hour expiry) stay valid for up to
  8 hours post-migration — keep old `hasRole('MANAGER')` guards live for 24 hours, then remove in Phase 9.

- [ ] **DB export within 24 hours of this phase:** fresh backup, not the 2026-09-28 one.

### 8a — DM rename migration

```sql
UPDATE app_user SET role = 'REPORTING_MANAGER' WHERE role = 'DM';
ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
    CHECK (role IN ('EMPLOYEE','REPORTING_MANAGER','PM','ADMIN','SUPERADMIN',
                    'MANAGER','FINANCE','LEADERSHIP'));
    -- MANAGER, FINANCE, LEADERSHIP kept temporarily for in-flight JWT tokens
```

### 8b — Team Lead conversion

```sql
UPDATE app_user SET role = 'EMPLOYEE' WHERE role = 'MANAGER';
-- project.lead_id (renamed in Phase 4) still points to them — no project data lost
```

### 8c — Phase 9 cleanup migration (remove legacy roles, run 24h after 8b)

```sql
ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
    CHECK (role IN ('EMPLOYEE','REPORTING_MANAGER','PM','ADMIN','SUPERADMIN'));
```

### 8d — AppUser.Role enum

Add `REPORTING_MANAGER`. Remove `DM`, `FINANCE`, `LEADERSHIP`, `MANAGER` (after 24h buffer in Phase 9).
Update `ROLE_LABELS`, `CREATABLE_ROLES`.

### 8e — UserService hierarchy (simplified — decision 11)

```java
// One rule replaces the entire REQUIRED_MANAGER_ROLE map:
if (role != SUPERADMIN) {
    if (manager == null)
        throw BAD_REQUEST("Reporting Manager is required.");
    if (!Set.of(REPORTING_MANAGER, ADMIN, SUPERADMIN).contains(manager.getRole()))
        // DM no longer accepted (was accepted in Phase 6 window)
        throw BAD_REQUEST("Reporting Manager must be a Reporting Manager, Admin, or Super Admin.");
}
```

### 8f — EodAccessPolicy update (decision 12)

```java
static boolean canRead(AppUser actor, EodEntry entry) {
    if (entry.getEmployee().getId().equals(actor.getId())) return true;
    if (actor.getRole() == SUPERADMIN)          return true;
    if (actor.getRole() == PM)                  return isOnActorsProject(actor, entry);
    if (actor.getRole() == ADMIN)               return true;  // fallback approver — sees all
    if (actor.getRole() == REPORTING_MANAGER)   return isDirectReport(actor, entry.getEmployee());
    return false;
    // MANAGER, DM, LEADERSHIP removed (roles gone or converted)
}
```

PM read scope: entries where at least one task belongs to a project the PM manages.

### 8g — hasRole('MANAGER') replacement

- `TeamLeadProjectController`: replace with capability-based check
  (`projectLeadRepository.existsByLeadIdAndProjectId(actorId, projectId)`).
- `TeamReportsController`: replace with `hasDirectReports(actorId)` service check.
- Keep both old checks live for 24 hours (in-flight JWT safety), then remove in Phase 9.

### 8h — EodReminderScheduler final SUBMITS_EOD

```java
Set.of(EMPLOYEE, PM, ADMIN, REPORTING_MANAGER)
```

### 8i — Frontend

`types.ts`: `'lead'` → `'reporting_manager'` in Role type.
All `role === 'lead'` guards → use `capabilities.leadsProjectIds.length > 0`.
`nav.ts` labels and role colours updated.

### 8j — Seed accounts

- `teamlead@nforceone.com` → role becomes EMPLOYEE, still leads projects via `lead_id`.
- Add `reportingmanager@nforceone.com` test account.
- Rename or update delivery manager test account.
- Update backend and frontend CLAUDE.md with new roles and test accounts.

### Verification

- Old `teamlead@` can log in and sees lead sections (capability-driven, not role).
- New `reportingmanager@` logs in, sees My Reports and small approval queue.
- Employee without lead assignment tries `/team/approvals` → 403.
- PM tries to create project → 403.
- `GET /api/auth/me` returns `role: 'reporting_manager'` for old DM users.
- Approval pieces route correctly to REPORTING_MANAGER users.
- DM user reading an entry for someone not their direct report → 403.

### Merge safety

NOT safe on its own. Phases 1–7 must be live and verified first. Phase 8 is not independently
reversible. Run in a single after-hours deploy window.

---

## Phase 9 — Cleanup

**Risk: Low. Dead code removal.**

- Remove `hasRole('MANAGER')` fallback guards (24h after Phase 8).
- Run 8c migration (remove MANAGER, DM, FINANCE, LEADERSHIP from CHECK constraint).
- Remove `MANAGER`, `DM`, `FINANCE`, `LEADERSHIP` from `AppUser.Role` enum.
- Remove DM nav section from `nav.ts`.
- Remove old `GET /api/approvals/pending` and `POST /api/approvals/{id}/approve` endpoints
  (confirm no client still calls them first).
- Remove `TeamLeadProjectController` if fully replaced by capability-scoped endpoints.
- Fix N+1 in batch approval (approve 20 entries runs one query per task — fix with JOIN fetch).
- Add any missing indexes found during load testing.
- Update `backend/CLAUDE.md` and `frontend/CLAUDE.md`: new roles, new test accounts, Flyway top version.
- Remove MANAGER/DM/FINANCE/LEADERSHIP from `RoleLabels.java` (AI contract).

### Verification

Full regression: all five roles log in, all approval flows work, no console errors, no 500s.

---

## Rollback paths

| Phase | Rollback |
|---|---|
| 1 | Drop new tables/columns, remove migration rows from `flyway_schema_history` |
| 2 | Drop new `approval2/` code, revert `EodService`, remove new endpoints |
| 3 | Revert frontend only |
| 4 | Rename columns back — no data change |
| 5 | Remove `capabilities` from `UserDto` |
| 6 | Revert permission annotations and validation changes |
| 7 | Revert frontend only |
| 8 | **No clean rollback.** Restore from the fresh DB export taken immediately before. Git revert is not enough — DB data has changed. |
| 9 | Revert code deletion |
