---
# N-Force Sync Backend — Context

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

## Rules for every module
- Flyway owns schema. Two underscores: V2__name.sql
- Never expose entities from controllers. DTOs only. NEVER include password hash in any DTO.
- Constructor injection, not field @Autowired.
- Validate all request DTOs with jakarta.validation.
- Every user create/deactivate/role-change writes an audit_log row.

## Module structure (module-by-feature)
```
com.nforceone.sync/
  config/          — SecurityConfig, CorsConfig, and future infrastructure config
  auth/            — AppUser entity, PasswordResetToken, AuditLog, repositories,
                     AuthController, JwtService, UserDetailsServiceImpl, DTOs
  employee/        — Employee entity, repository, controller, DTO (pre-existing)
```

## Auth tables (V2 migration)
- app_user: id (BIGSERIAL PK), full_name, email (UNIQUE), password_hash, role (CHECK 8 values),
  employee_code (GENERATED ALWAYS AS IDENTITY, starts 1001), status (ACTIVE/INACTIVE), created_at, created_by (FK self)
- password_reset_token: id, user_id (FK app_user), token (UNIQUE), expires_at, used (BOOLEAN)
- audit_log: id, entity_type, entity_id, action, actor_id (FK app_user), before_value (JSONB), after_value (JSONB), occurred_at
- Seed: admin@nforceone.com / ChangeMe123! (bcrypt) as SUPERADMIN

## Seed super admin credentials (local dev only)
email: admin@nforceone.com
password: ChangeMe123!   ← change on first login
---
