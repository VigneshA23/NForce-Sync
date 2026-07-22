---
# N-Force Sync — Build Context

## Product
Internal platform for NForce One (~150 users, 8 roles).
Employee submits End-of-Day report → manager approves → utilization auto-computes from APPROVED hours only → dashboards.

## THE SPINE — never violate
Utilization % = (Approved productive hours ÷ Available working hours) × 100
- ONLY approved hours count. Submitted ≠ counted.
- Available hours EXCLUDE weekends, company holidays, approved leave.
- available = 0 → show "N/A". NEVER 0%. Null and zero are different states.
- Daily snapshot. Never retroactively recalculated.
- Config changes are FORWARD-ONLY. Past periods never re-flagged.
- Read-only after submit. Every state change audited.

## SINGLE SOURCE OF TRUTH
All thresholds live ONLY in src/lib/rules.ts. Never hardcode a threshold anywhere.
- under-utilized: < 60% | healthy: 60–100% | over-utilized: > 100%
- BENCH = exactly 0% allocation. Nothing else. 41% = "under-allocated", NOT bench.

## Design language — dark control-room
Calm charcoal shell so COLOUR CARRIES MEANING, not decoration.
Crimson reserved for brand moments + primary actions ONLY. Never decorative.

--shell #0E0F12 | --panel #16181D | --raised #1E2128 | --raised2 #262A32
--line #2A2E37 | --line2 #353A45
--brand #B11116 | --brand-bright #E4373D | --brand-deep #7A0C10
--txt #E8EAED | --txt-mut #9BA1AC | --txt-dim #6B7280
--ok #2FB67C | --warn #E0A93B | --risk #E4373D | --info #4C8DD6

Fonts: Space Grotesk (headings, KPI values) · Inter (body/UI) · JetBrains Mono (hours, %, timestamps — tabular-nums so columns align)

## THE LOGO — important
File: src/assets/nforce-logo.png (512×512 PNG, black circular badge, white NF monogram, pure-red slash).
Its background is HARD BLACK (#000000) but our shell is #0E0F12 — so it renders as a visible dark disc with a seam. Never place it raw on the shell.
ALWAYS wrap it in a <BrandMark> component: circular container, 1px rgba(228,55,61,.25) ring, subtle radial crimson glow behind, slight inner shadow. The black must read as intentional depth, not a mismatched cut-out.
The logo's red is pure #FF0000 — do NOT sample it for UI. UI crimson stays #B11116/#E4373D (deliberately calmer on dark).

## Non-negotiable UI rules
1. Utilization ALWAYS = number + bar. Never colour alone.
2. Every UtilBar etches threshold ticks at 60% and 100% into the track. The legend IS the component.
3. NEVER the same colour for opposite states. Bench ≠ over-allocated visually.
4. Weekday-only charts. Never plot Sat/Sun utilization.
5. focus-visible ring on EVERY interactive element.
6. Every data view: loading skeleton + empty state + error state.
7. Dates DERIVE from a function. Never hardcode day strings.
8. Respect prefers-reduced-motion.

## Authentication model (CONFIRMED — email + password NOW, SSO later)

### Phase 1 — email + password + JWT
- Login: email + password. Passwords hashed with bcrypt, never stored plain. Company-domain emails only (@nforceone.com).
- On login: issue a signed JWT, 8-hour expiry; stateless, validated every request; role/team changes take effect immediately.
- Account creation: new users sign up with a company-domain email and MUST verify via a time-limited link before first login. New signups ALWAYS start as a base Employee — only a Super Admin promotes/assigns roles. No self-assigned elevated access.
- Password reset: single-use link, valid 1 hour. The forgot-password screen NEVER reveals whether an email is registered (no user enumeration). Super Admins can also reset a user's password directly.
- Deactivation, not deletion: deactivated accounts are blocked immediately but retained for historical/audit records.

### Phase 2/3 — Microsoft SSO (additional path, not replacement)
- Added as an ADDITIONAL sign-in option ("Continue with Microsoft SSO") alongside existing email+password.
- SSO users authenticate on Microsoft's page; our app never sees or stores their Microsoft password.
- The login screen will show both paths: SSO button (primary) + credentials form (fallback).
- Implementation depends on company Azure AD configuration — coordinate with IT when ready.

## Roles — 8 roles, enforced server-side
employee, lead, pm, dm, hr, finance, leadership, superadmin.
The auth mechanism above is reused from NForce timetracker but N-Force Sync keeps its full 8-role set. Super Admin performs provisioning duties (create users, assign roles, reset passwords, deactivate). Enforce access on the SERVER for every request, not just in the UI. Leadership is READ-ONLY. One role per user. Restricted route → "Not authorized".

## Admin creates users (User Management screen — backend phase)
Super Admin creates an employee by entering: full name, company email, initial password, role (one of the 8), and an auto-incrementing employee ID. Created users are persisted in the database and can then log in. This is a BACKEND feature (DB + API) — the frontend User Management screen calls it.

## Login screen (current state for demo)
The login currently shows the SSO button + credentials form + demo role-picker. SSO button is visually present but INERT. Credentials form simulates errors (generic "Invalid email or password" — never reveals whether account exists). Demo role-picker is the working entry. This is correct for now — all three will become functional in the backend phase.

## Quality bar
This must look like a shipped enterprise product, not a mockup. Layered elevation, purposeful motion, real depth. Reference quality: Linear, Vercel dashboard, Stripe.
---
