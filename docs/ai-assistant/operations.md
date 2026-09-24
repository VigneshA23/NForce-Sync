# Operations

Day-to-day running of the assistant: the ops page, reindexing, rate limits, billing, retention,
and the live eval harness. All admin endpoints below are `@PreAuthorize("hasRole('SUPERADMIN')")`
and live under `/api/ai-assistant/admin/*`; the ops page at `/admin/ai` (Super Admin only) is a
UI over the same endpoints.

## Endpoint summary

| Method + path | Guard | Purpose |
|---|---|---|
| `POST /api/ai-assistant/chat` | authenticated | Send a message |
| `GET /api/ai-assistant/conversations/{id}` | authenticated, owner-scoped | Replay a conversation |
| `POST /api/ai-assistant/conversations/{id}/clear` | authenticated, owner-scoped | Clear (keeps the id) |
| `POST /api/ai-assistant/feedback` | authenticated | Thumbs up/down + optional comment |
| `GET /api/ai-assistant/health` | authenticated | Status for the launcher's gating check |
| `POST /api/ai-assistant/admin/reindex` | SUPERADMIN | Rebuild the knowledge index |
| `GET`/`PUT /api/ai-assistant/admin/rate-limit-settings` | SUPERADMIN | View/edit the rate limit |
| `GET /api/ai-assistant/admin/usage-stats?days=` | SUPERADMIN | Usage charts data |
| `GET /api/ai-assistant/admin/billing` | SUPERADMIN | Month-to-date cost estimate |
| `GET`/`PUT /api/ai-assistant/admin/billing-settings` | SUPERADMIN | Budget + per-token pricing |

## Health

`GET /health` reports `enabled`, `indexReady`, `indexedChunks`, `lastIndexedAt`,
`knowledgeSources`, `llmProvider`, `embeddingProvider`, `embeddingDimensions`,
`maxMessageChars`. Stats are cached for 30 seconds so the launcher's per-page-load health check
doesn't hit the DB on every render (I18) — a disabled assistant short-circuits before any DB work
at all. The frontend launcher only renders when `enabled && indexReady`; a failed health call hides
it silently rather than showing an error.

## Reindexing

`POST /admin/reindex` re-reads every YAML file under `ai-knowledge/`, validates the whole set
(`KnowledgeSchemaValidator` — collects every problem, not just the first), embeds, and writes in
**one transaction** (I1). If validation fails, nothing is written and the previous index stays
fully intact — the response reports the validation problems (422), not a partial index. If zero
chunks would result, the reindex is also refused rather than silently emptying the index.

Chunks whose content hash and embedding model are unchanged since the last reindex are **not**
re-embedded (I2) — the report distinguishes `reused` vs `embedded` counts. Run a reindex twice in a
row with no YAML changes and expect `reused ≈ total chunks`, `embedded ≈ 0`.

Reindexing is guarded by a single-flight lock (an `AtomicBoolean`), so two concurrent reindex
requests can't interleave.

**Always reindex after any change under `ai-knowledge/`** — nothing indexes automatically, not
even on app startup.

## Rate limiting

Per-user sliding-window limiter, defaults 60 requests / 60 minutes, both configurable
(1–1000 requests, 1–1440 minutes) via `GET`/`PUT /admin/rate-limit-settings`. Settings are cached
in-memory with a 30s TTL and **fail open** to the last-known-good value (or a safe default) if the
settings read itself fails — a broken settings row must never take down chat entirely.

A limited request gets HTTP 429 with body
`{"error", "code":"AI_ASSISTANT_RATE_LIMIT_EXCEEDED", "retryAfterSeconds", "retryAt"}` plus a
`Retry-After` header — mirrors Sync's existing login-lockout 423 convention (`retryAfterSeconds` +
header), not OneHR's shape. The frontend shows a live countdown and disables Send until `retryAt`
(I13).

The limiter's internal map is evicted on a schedule for idle users, so it doesn't grow unbounded
(I3) — uses the existing `@EnableScheduling` infrastructure, no new scheduler.

Settings changes write an `audit_log` row, same as every other admin action in Sync.

## Billing

`GET /admin/billing` returns a **month-to-date estimate**, computed from `ai_interaction_log`
token counts and the configured per-million-token prices — explicitly labeled "Estimate — not your
Mistral invoice" everywhere it's shown, because it's a same-model-family approximation, not
Mistral's actual bill.

`GET`/`PUT /admin/billing-settings` — monthly budget and USD-per-million-token prices for prompt,
completion, and embedding tokens. V95 seeded these with real Mistral pricing verified at build
time (prompt $0.15, completion $0.15, embedding $0.10 per million tokens as of 2026-09-24) —
**re-verify current pricing before trusting the seeded defaults after any significant time has
passed**; Mistral's pricing is not fetched live.

All aggregation is SQL `GROUP BY` in the repository (I16) — usage/billing stats are never computed
by loading interaction-log rows into application memory.

## Usage stats

`GET /admin/usage-stats?days=` (7/30/90 typical) returns KPIs plus daily series for charts:
requests/tokens over time, and breakdowns by response type and error code. Backing queries are all
native SQL aggregates (`AiInteractionLogRepository`'s `aggregateTotals`, `dailySeries`,
`errorCodeBreakdown`, `responseTypeBreakdown`, `aggregateTokens`).

## Retention

A nightly scheduled job (`AiRetentionJob`, default cron `0 30 2 * * *`, i.e. 02:30 daily) deletes:
- conversation messages older than `app.ai.retention.message-days` (default 90)
- interaction-log rows older than `app.ai.retention.log-days` (default 365)

Both are configurable, and the whole job is skippable via `app.ai.retention.enabled=false`.
`ai_interaction_log` never stores message text in the first place (only metadata/metrics), so its
longer 365-day retention carries much less exposure than the 90-day message retention.

## The live eval harness

`AiEvaluationHarness` (`backend/src/test/java/.../ai/eval/AiEvaluationHarness.java`) sends real
HTTP requests to a running Sync backend, logs in with real test credentials, and calls the real
`/chat` endpoint with real Mistral calls — it costs money and never asserts (answers are model
output; the same question can pass then fail with no code change), so it only ever **reports** a
scorecard.

It's deliberately excluded from a plain `mvn test` on two independent layers:
1. Its class name doesn't match Surefire's default test-discovery pattern
   (`*Test`/`*Tests`/`Test*`/`*TestCase`) — a full `mvn test` run never even discovers it, which was
   confirmed empirically (it's absent from a full-suite run's per-class output, not merely
   skipped-and-listed).
2. Even when run explicitly by name, `Assumptions.assumeTrue` aborts it immediately unless
   `AI_EVAL_BASE_URL` is set.

Run it explicitly, against a running instance:

```
AI_EVAL_BASE_URL=http://localhost:8080 \
AI_EVAL_EMPLOYEE=employee@nforceone.com:ChangeMe123! \
AI_EVAL_MANAGER=teamlead@nforceone.com:ChangeMe123! \
AI_EVAL_PM=projectmanager@nforceone.com:ChangeMe123! \
AI_EVAL_ADMIN=useradmin@nforceone.com:ChangeMe123! \
AI_EVAL_SUPERADMIN=superadmin@nforceone.com:ChangeMe123! \
  mvn test -Dtest=AiEvaluationHarness -DfailIfNoSpecifiedTests=false
```

Any subset of `AI_EVAL_<ROLE>` vars can be set — questions for a role with no credential supplied
are reported as skipped, not failed. Output is a plain scorecard on stdout: pass/total, then a
`FAIL`/`SKIP` line per problem question.

## Tuning

Only change `retrieval.min-score` (default 0.60) or the follow-up-context flag
(`retrieval.follow-up-context`) based on actual scorecard evidence from the live harness — not on
a hunch. In particular, don't lower `min-score` to "fix" a bad answer without confirming the eval
set's canary question (a clearly out-of-scope question, e.g. "capital of France") still correctly
gets `UNKNOWN` at the new threshold — a lower floor that fixes one under-triggering answer can
just as easily make the assistant start answering things it shouldn't.

## Real-app validation checklist

The one part of this build that requires a human running the actual app in a browser — nothing in
CI or the harness substitutes for it. For each of Employee, Team Lead, PM, Admin, Super Admin, plus
one of DM/Finance/Leadership:

- Launcher visibility (bottom-right, hidden if disabled/not-ready).
- A how-to question returns steps.
- "Take me to …" navigation actually lands on a real page.
- A question about a placeholder-role page gets a "not yet available" answer, no CTA.
- A question about another role's feature gets `PERMISSION`, no CTA.
- "Capital of France" (or similar) → `UNKNOWN`.
- A short follow-up question after a longer one uses the follow-up-context blend correctly.
- A live-data question ("is my EOD for today submitted?", "how many approvals are pending?")
  returns real numbers.
- Feedback (thumbs up/down + comment) lands in `ai_interaction_log`.
- Close and reopen the panel → transcript replays from `sessionStorage`.
- Clear conversation.
- Lower the rate limit to 2/1min on the ops page → see the 429 countdown kick in.
- Disable the assistant (`app.ai.enabled=false`) → launcher hidden, rest of Sync unaffected.
- An invalid/expired Mistral key → a controlled "temporarily unavailable" answer, and **no
  logout** — confirms `AiExceptionHandler` is actually catching everything before it reaches
  `/error` (this is the single most safety-critical manual check, per C16 in the plan: any
  uncaught non-login 401 in Sync logs the user out client-side).

Also spot-check regressions in EOD submit, approval, allocation, search, notifications and the
theme/density/font-size preferences — these are untouched code paths but share `Shell.tsx` with
the newly-mounted launcher.
