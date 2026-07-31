---
# Nforce Sync Backend — Context

## Tech stack

Spring Boot 4.1.0 (not 3.5 as originally planned — drifted during dependency additions, kept
deliberately since auth was built and tested on it) · Java 17 · PostgreSQL 16 · Flyway owns
schema · Hibernate (ddl-auto: validate)

Spring Boot 4.1.0 brings:
- Spring Security 7 — breaking API changes vs 6.x: DaoAuthenticationProvider requires
  UserDetailsService as constructor arg (no no-arg constructor), requestMatchers() without
  HttpMethod constraint for permitAll() (method-constrained form has path-matching regression).
- Jackson 3 — package renamed from com.fasterxml.jackson.* to tools.jackson.*. JacksonException
  is now RuntimeException (was checked IOException). Java time support built into jackson-databind
  (no JavaTimeModule registration needed). JacksonAutoConfiguration does not fire under
  spring-boot-starter-webmvc — ObjectMapper is declared as an explicit @Bean in GlobalExceptionHandler.

⚠ Juniors and Claude Code may see Spring Boot 3.5 / Security 6 / Jackson 2 examples online.
  Verify against actual 4.1 / Security 7 / Jackson 3 APIs when something looks off, especially:
  requestMatchers(), filter registration (@Component vs @Bean), DaoAuthenticationProvider
  constructor, and any import starting with com.fasterxml.jackson (wrong in this project).

Package: com.nforceone.sync — modular monolith, module-by-feature.
DB user is the local Mac username, trust auth, empty password (local dev only).

## Authentication model (build this now — email + password + JWT)
- Login: email + password. Bcrypt hashed, never plain text. Company-domain emails only (@nforceone.com).
- On login: issue a signed JWT (8-hour expiry), stateless, validated on every request.
- New users are created ONLY by a Super Admin (no public signup endpoint for now — email verification comes later).
- Password reset: single-use link, 1-hour validity, generic "if that email exists" response (build the endpoint shape now, email delivery can be stubbed).
- Deactivation not deletion: deactivated users are blocked from login but retain their row.
- Roles for THIS PHASE (4 of the eventual 8): EMPLOYEE, MANAGER, HR, SUPERADMIN. Design the schema to hold all 8 eventually but only seed/test these 4 now.
- Authorization enforced SERVER-SIDE on every request — never trust the frontend alone.
- Before any non-local deployment, set a real JWT_SECRET environment variable — application.yml's current value is an intentionally obvious dev-only placeholder and must never be used outside local development.

## Flyway: the DB is AHEAD of this repo ⚠
- `validate-on-migrate: false`, so Flyway will NOT warn when the database sits at a higher
  version than the repo's files.
- V21–V24 were applied to the shared Neon DB from a working copy whose `.sql` files were never
  committed. Treat `flyway_schema_history` as the source of truth, NOT `db/migration/`.
- ALWAYS check before adding a migration, and number ABOVE the top version:
  `SELECT version, description FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;`
- Flyway silently SKIPS any local file at/below the recorded version; the app then dies with
  `SchemaManagementException: missing column`. That's a skipped migration, not a code bug.
- Flyway expands `${...}` as a placeholder EVEN INSIDE `--` comments — never put `${}` (e.g. a JS
  template literal) in a migration comment; it fails to parse before touching the DB.

## Debugging gotchas
- `ddl-auto: validate` → any entity/DB drift stops the app BOOTING (`wrong column type` /
  `missing column`). Read the startup log first: a down app looks like an API bug.
- `{"error":"Unauthorized"}` is SecurityConfig's entry point, NOT necessarily an auth failure —
  a controller exception forwarded to `/error` surfaces this way. Genuine bad credentials return
  `{"error":"Invalid email or password"}`. Check the server log for the real exception.
- `open-in-view: false` — lazy associations fail outside a transaction. DTO mappers that touch
  them (e.g. `UserDto.from` → `getManager()`) must run inside one.
- INACTIVE users get the same generic "Invalid email or password" as a wrong password
  (deliberate, prevents enumeration) — don't chase it as a bug.

## Local workflow
- Verify: `./mvnw.cmd -o compile` — the real check. Java language-server diagnostics go stale
  after adding nested enums or record components; trust the compiler, not the squiggles.
- Run: `./mvnw.cmd spring-boot:run`; restart for ANY entity/endpoint/migration change.
  Backgrounded from a tool shell it gets reaped — run it in your own terminal.
- Inspect the DB: psql at `/c/Program Files/PostgreSQL/16/bin/psql`, creds in `application.yml`.
- Test logins (all `ChangeMe123!`, all `@nforceone.com`): `superadmin@` · `projectmanager@` (PM)
  · `teamlead@` (MANAGER) · `employee@` (EMPLOYEE, currently INACTIVE).

## Rules for every module
- Flyway owns schema. Two underscores: V2__name.sql
- Never edit user data directly in Neon's table view — always via a Flyway migration file, so changes are tracked in git and don't silently conflict with what the app expects.
- Never expose entities from controllers. DTOs only. NEVER include password hash in any DTO.
- Constructor injection, not field @Autowired.
- Validate all request DTOs with jakarta.validation.
- Every user create/deactivate/role-change writes an audit_log row.


## Auth tables (V2 migration)
- app_user: id (BIGSERIAL PK), full_name, email (UNIQUE), password_hash, role (CHECK 8 values),
  employee_code — NO LONGER an identity column: since V21/V24 it is a manually-entered VARCHAR
  business ID, format 'NF-' + 8 digits (e.g. NF-20240069), NOT NULL UNIQUE with a format CHECK.
  status (ACTIVE/INACTIVE), created_at,
  created_by (FK self), manager_id (FK self, added V3 — Team Lead for this employee)
- password_reset_token: id, user_id (FK app_user), token (UNIQUE), expires_at, used (BOOLEAN)
- audit_log: id, entity_type, entity_id, action, actor_id (FK app_user), before_value (JSONB), after_value (JSONB), occurred_at
- Seed: superadmin@nforceone.com / ChangeMe123! (bcrypt) as SUPERADMIN

## Project & allocation tables (V3 migration)
- project: id, code (UNIQUE), name, client, project_type, billing_model,
  status (ACTIVE/INACTIVE/COMPLETED/ON_HOLD), pm_id (FK app_user), start_date, end_date, created_at
- allocation: id, employee_id (FK app_user), project_id (FK project),
  effective_from DATE, effective_to DATE NULL (null = open-ended), created_at
  A plain assignment: this employee is on this project for this period. V29 dropped
  allocation_pct (V3) and allocation_type (V25) — there is no percentage, no PRIMARY/SECONDARY,
  and therefore NO capacity ceiling. Nothing currently stops the same employee being allocated
  to unlimited overlapping projects, or to the same project twice; a unique employee+project
  guard over overlapping dates is the open follow-up.
- task_category: id, name (UNIQUE), is_productive BOOLEAN, is_billable_default BOOLEAN, active BOOLEAN
  Seeded with 19 PRD categories. NOT productive: "Leave", "Bench Activity". All others productive.
  "Leave / Holiday" was renamed to "Leave" in V35 (same id 19, no rows repointed) once Holiday
  became a day type rather than a category.
- Seed: Priya Nair (id=2, MANAGER) set as manager_id for employees id=3,4,5

## EOD tables (V4 migration)
- eod_entry: id, employee_id FK, entry_date DATE, status (DRAFT/SUBMITTED/APPROVED/REJECTED/CHANGES_REQUESTED/MISSED),
  day_type (WORKING_DAY/LEAVE/HOLIDAY, added V35, DEFAULT 'WORKING_DAY'),
  time_adjustment_type (LATE_ARRIVAL/INTERVENING/EARLY_LEAVE NULL) + time_adjustment_minutes INT NULL,
  is_overtime BOOLEAN DEFAULT FALSE + overtime_hours NUMERIC(5,2) NULL   (all added V36),
  work_location, next_day_plan, remarks, submitted_at, created_at, updated_at
  UNIQUE (employee_id, entry_date)
- eod_task: id, eod_entry_id FK ON DELETE CASCADE, project_id FK NULL, task_category_id FK NULL,
  description, hours NUMERIC(5,2), task_status (COMPLETED/IN_PROGRESS/BLOCKED/NOT_STARTED), is_billable,
  blocker_reason, support_needed
  CHECK: blocked tasks must have blocker_reason
- Status uppercase to match existing conventions (ACTIVE, SUPERADMIN pattern)
- Business rules: submitted entries are immutable; edit only allowed in REJECTED or
  CHANGES_REQUESTED status
- Day type (V35) drives validation in EodService:
  HOLIDAY  → work_location forced NULL, zero task rows persisted, all task/hours checks skipped
  LEAVE    → rows with category "Leave" have project/is_billable/task_status forced to
             NULL/false/COMPLETED in buildTask, so a raw API call cannot set them
  The old "Leave / Holiday must have hours=0" rule is GONE — leave rows now carry real hours
  (8 full day, 4 + 4 half day).
- Time adjustment (V36) — a partial-day schedule shift on a WORKING_DAY, not an absence:
  Duration limit 30-120 min for ALL THREE types, re-validated server-side; must also not exceed
  the employee's shift length. Requires an assigned shift (app_user.shift_id) — no shift, no
  adjustment. Cleared automatically when day type is not WORKING_DAY.
  Monthly allowance = business_rule_config.{late_arrival,early_leave,intervening}_allowance
  (global, SUPERADMIN-editable). Usage is COUNTed live per calendar month, EXCLUDING DRAFT
  entries and excluding the entry being submitted (so resubmitting after a changes-request
  cannot fail against itself). No reset job — the month window does it.
  Shift duration adds 1440 when end <= start, so overnight shifts (e.g. 15:30-00:30) measure
  540 min, not -900.
- HOURS NEVER REJECT A SUBMISSION. Reference = expectedHours
  ((shiftDuration - adjustmentMinutes)/60) when an adjustment is active, else
  standard_hours_per_day. Anything above it sets is_overtime/overtime_hours for the manager
  (badge on the Approvals row). The flat cap is a reference, not a limit.
- GET /api/eod/time-adjustment-context is employee-scoped and deliberately NOT under
  /api/admin/business-rules, which is SUPERADMIN-only — an employee must be able to read their
  own shift and allowance usage.

## Utilization snapshot (V6 migration)
- util_snapshot: id, employee_id FK, snapshot_date DATE, available_hours, approved_productive_hours,
  billable_hours, non_billable_hours, bench_hours, idle_hours, utilization_pct NULLABLE, computed_at
  UNIQUE (employee_id, snapshot_date)
- THE SPINE (absolute): available==0 → utilizationPct=NULL (never 0.0). 0 approved + available>0 → 0.0.
  Uncapped (>100 allowed). Only APPROVED hours count. Written on approval only, never retroactively.
- UtilizationCalculator (package-private): computeAvailableHours (weekend→0, weekday→8),
  computeUtilizationPct (null vs 0.00 distinction is THE SPINE invariant)
- recomputeForEntry wired into ApprovalService.approveEntry ONLY (not reject/requestChanges)
- AppUserRepository.findByManagerId used for team endpoint

## Approval table (V5 migration)
- approval_action: id, eod_entry_id FK, actor_id FK, action (APPROVE/REJECT/REQUEST_CHANGES),
  comment TEXT NULL, billable_override BOOLEAN NULL, acted_at TIMESTAMPTZ
- State machine: SUBMITTED → APPROVED | REJECTED | CHANGES_REQUESTED only. Illegal transitions throw CONFLICT.
- Authorization: actor must be the employee's direct manager (manager_id FK) OR SUPERADMIN.
  No manager assigned → only SUPERADMIN can act.
- billable_override: stored on approval_action, does NOT mutate eod_task records; applied at billing calc time.

## Module structure (module-by-feature)
```
com.nforceone.sync/
  config/          — SecurityConfig, CorsConfig, GlobalExceptionHandler
  auth/            — AppUser, PasswordResetToken, AuditLog, repositories, AuthController,
                     JwtService, UserDetailsServiceImpl, DTOs
  admin/           — UserController, UserService, AdminStatsController, AuditLogController,
                     RolesController, AuditLogSpecs, DTOs
  project/         — Project, Allocation, TaskCategory entities + repositories (no controllers yet)
  eod/             — EodEntry, EodTask entities, EodEntryRepository, EodService, EodController, DTOs
                     POST /api/eod/draft  POST /api/eod/{id}/submit
                     GET  /api/eod        GET  /api/eod/{id}
                     Employees see own entries; MANAGER/HR/SUPERADMIN/DM/LEADERSHIP can see others'
  approval/        — ApprovalAction entity, ApprovalService, ApprovalController, DTOs
                     GET  /api/approvals/pending
                     POST /api/approvals/{entryId}/approve
                     POST /api/approvals/{entryId}/reject
                     POST /api/approvals/{entryId}/request-changes
                     POST /api/approvals/batch-approve
  utilization/     — UtilSnapshot entity, UtilSnapshotRepository, UtilizationService,
                     UtilizationController, UtilizationCalculator (package-private)
                     GET  /api/utilization/employee/{id}?from=&to=
                     GET  /api/utilization/team/{managerId}?date=
  employee/        — Employee entity (pre-existing, legacy)
```

## Seed super admin credentials (local dev only)
email: superadmin@nforceone.com
password: ChangeMe123!   ← change on first login
---
