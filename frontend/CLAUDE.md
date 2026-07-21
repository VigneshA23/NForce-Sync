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

## Authentication model (OPEN DECISION — confirm with company before backend build)
Primary path is Microsoft SSO. Likely final design: SSO-ONLY.

Key facts:
- With SSO, our app stores NO passwords. Ever. Identity is Microsoft's responsibility. The user's only password is their existing Microsoft/Outlook one, managed by company IT — our app never sees, stores, creates, or resets it.
- Users never "create a password" in our app. There is no password to create. First login = they authenticate on Microsoft's page with credentials IT already gave them.

User provisioning lifecycle:
1. Company IT creates the person's Microsoft account (password lives there).
2. Super Admin creates their profile in OUR app: role, department, projects — NO password.
3. First login: SSO verifies their identity; we match the verified email to the admin-created profile.

DECISION PENDING: Does anyone who needs access lack an NForce Microsoft account (contractors, service accounts, break-glass admin)?
- If NO → SSO-ONLY. Remove the email/password form and "Forgot password" entirely. Simpler and more secure.
- If YES → keep a local email/password fallback for THOSE accounts only. That local password is separate from Microsoft, stored in our DB, and "Forgot password" resets ONLY that local password — never the Microsoft one. SSO users never see the password form or "Forgot password".

For the DEMO: login UI shows both paths but all are inert; role-pills are the entry point. No change needed now.

## Quality bar
This must look like a shipped enterprise product, not a mockup. Layered elevation, purposeful motion, real depth. Reference quality: Linear, Vercel dashboard, Stripe.

## 8 roles
employee, lead, pm, dm, hr, finance, leadership, superadmin
Leadership is READ-ONLY. One role per user. Restricted route → "Not authorized".
---
