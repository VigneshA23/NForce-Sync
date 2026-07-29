---
# Nforce Sync — Build Context

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
- ⚠ Allocations no longer carry a percentage. V29 dropped `allocation_pct`, so an allocation is
  just employee + project + date range, and the old "BENCH = exactly 0% allocation" definition is
  no longer expressible. `benchAllocation`/`isBench`/`allocationLabel` were removed from rules.ts.
  The utilization thresholds above are UNAFFECTED — utilization is computed from approved EOD
  hours ÷ available hours and never referenced allocation %.

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

## Styling convention — inline styles, NOT Tailwind
Tailwind is configured (`@tailwind` directives in index.css) but pages and components style with
inline `style={{}}` objects using the CSS custom properties above (`var(--txt)`, `var(--panel)`).
Match that; don't introduce Tailwind utility classes into existing components.

## Dialogs — one shared component
`src/components/Modal.tsx` is the ONLY dialog implementation; every modal in every role renders
through it, so fix layout/behaviour there once rather than per page. It caps height to the
viewport, scrolls its body internally, and locks background scroll while open.

## framer-motion owns `transform` ⚠
Never centre a `motion.div` with `transform: translate(-50%,-50%)` while animating `scale`/`y`.
framer-motion rebuilds `transform` from its own state and writes `transform: none` once the enter
animation settles, silently destroying the centring (symptom: dialog sits down-and-right, bottom
off-screen, worse at higher zoom). Centre with a `position: fixed; inset: 0` flex wrapper — see Modal.tsx.

## Typecheck / build
- `npm run build` = `tsc -b && vite build` — the single gate for typecheck + build.
- tsconfig.json is solution-style (project references only): `tsc --noEmit -p tsconfig.json`
  silently does NOTHING. Use `npx tsc -b`.
- The page scrolls on the DOCUMENT — Shell's `<main>` sets no overflow. Relevant for scroll locking.
- ⚠ `employeeCode` is mid-migration: the backend now returns a STRING (`NF-########`) but several
  `api/*.ts` types still declare `number`. Don't re-add an `NF-` display prefix — the stored value
  already carries it.

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
The auth mechanism above is reused from NForce timetracker but Nforce Sync keeps its full 8-role set. Super Admin performs provisioning duties (create users, assign roles, reset passwords, deactivate). Enforce access on the SERVER for every request, not just in the UI. Leadership is READ-ONLY. One role per user. Restricted route → "Not authorized".

## Admin creates users (User Management screen — backend phase)
Super Admin creates an employee by entering: full name, company email, initial password, role (one of the 8), and an auto-incrementing employee ID. Created users are persisted in the database and can then log in. This is a BACKEND feature (DB + API) — the frontend User Management screen calls it.

## Login screen (current state)
Real email + password login via POST /api/auth/login. JWT stored in localStorage (key: nfsync_session). On page refresh, getMe() re-validates the token — if expired/invalid, clears state and returns to login. SSO button is visually present but INERT (disabled, cursor: not-allowed). Demo role-picker has been removed. Error messages shown verbatim from server response. Lockout at 5 consecutive failures redirects to /locked.

## Quality bar
This must look like a shipped enterprise product, not a mockup. Layered elevation, purposeful motion, real depth. Reference quality: Linear, Vercel dashboard, Stripe.
---
