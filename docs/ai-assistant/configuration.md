# Configuration

All AI settings live under `app.ai.*`, bound by `ai/config/AiProperties`
(`@ConfigurationProperties(prefix = "app.ai")`) — the only `@ConfigurationProperties` class in
Sync today; every other module still uses `@Value`. This was a deliberate exception: enough
related settings (`mistral.*`, `retrieval.*`, `limits.*`, `retention.*`) exist that a typed record
of records is materially safer than a page of scattered `@Value` fields.

## `application.yml` block

```yaml
app:
  ai:
    enabled: ${AI_ASSISTANT_ENABLED:false}
    provider: ${AI_PROVIDER:mistral}
    live-data-enabled: ${AI_LIVE_DATA_ENABLED:true}
    mistral:
      api-key: ${MISTRAL_API_KEY:}
      base-url: https://api.mistral.ai
      chat-model: ${MISTRAL_CHAT_MODEL:ministral-8b-latest}
      embed-model: ${MISTRAL_EMBED_MODEL:mistral-embed}   # coupled to vector(1024) — see below
      timeout-seconds: 30
      connect-timeout-seconds: 5
      max-attempts: 3
      retry-backoff-millis: 500
      temperature: 0.2
      max-tokens: 1200
    retrieval:
      top-k: 8
      min-score: 0.60
      candidate-multiplier: 3
      max-context-chars: 12000
      follow-up-context: true
    limits:
      max-message-chars: 1000
      max-history-turns: 6
      max-history-chars: 6000
      turn-deadline-seconds: 45
    retention:
      enabled: true
      message-days: 90
      log-days: 365
      cron: "0 30 2 * * *"
```

## The API key

Set it one of two ways — never commit it:
- `MISTRAL_API_KEY` environment variable, or
- `app.ai.mistral.api-key` in the gitignored `backend/src/main/resources/application-local.yml`.

`AiProperties.isUsable()` is `enabled == true AND` a non-blank key. If either is false, `/health`
reports `enabled:false` and the assistant refuses every chat turn with a controlled `UNKNOWN` /
`DISABLED` response — **the rest of Sync boots and runs completely normally**. This was a
deliberate improvement: a missing/blank key must never be a startup failure.

The key is never logged. Neither is a JWT, a password hash, or any message text — see
`AiInteractionLogger`, which logs only metadata (counts, ids, token counts, latency), never
content.

## Field-by-field reference

### `mistral.*`

| Field | Default | Notes |
|---|---|---|
| `chat-model` | `ministral-8b-latest` | Chosen for the OneHR reference's subscription tier. If Sync's key allows a larger model, change this via env with no code change. |
| `embed-model` | `mistral-embed` | **Coupled to the schema.** `ai_knowledge_chunk.embedding` is `vector(1024)` — `mistral-embed` produces 1024-dim vectors. Changing to a different-dimension embedding model requires a new migration to alter the column, plus a full reindex. Don't change this in isolation. |
| `timeout-seconds` / `connect-timeout-seconds` | 30 / 5 | Per-HTTP-call timeouts on the JDK `HttpClient`. |
| `max-attempts` | 3 | Retries only on 429, 5xx, or `IOException` — never on 4xx (bad request, auth failure). Honors a `Retry-After` header from Mistral when present. |
| `retry-backoff-millis` | 500 | Base backoff; doubles per attempt within the shared turn deadline. |
| `temperature` | 0.2 | Low, for consistent structured-JSON answers. The provider check is `>= 0` (not `> 0`), so `0` is a legal, deterministic setting if ever needed. |
| `max-tokens` | 1200 | Caps the completion; the response contract (steps + answer + navigation + related) fits comfortably under this. |

### `retrieval.*`

| Field | Default | Notes |
|---|---|---|
| `top-k` | 8 | Chunks kept after boosting/dedup/budget, per turn. |
| `min-score` | 0.60 | Cosine-similarity floor. **Don't lower this without eval-harness evidence** — see [operations.md](operations.md#tuning). |
| `candidate-multiplier` | 3 | Over-fetch factor before boosting/dedup (so `top-k=8` fetches ~24 candidates). |
| `max-context-chars` | 12000 | Hard cap on total retrieved-knowledge text injected into the prompt. |
| `follow-up-context` | true | See I20 in the plan: a short (<80 char) follow-up question borrows the *previous* user question for embedding purposes only, when conversation history exists. Never shown to the user or sent to the model as "the question." |

### `limits.*`

| Field | Default | Notes |
|---|---|---|
| `max-message-chars` | 1000 | Enforced both by `@Size(max=4000)` at the controller (a generous outer bound) and this tighter business limit inside the service. |
| `max-history-turns` | 6 | How many prior turns are replayed into the prompt. |
| `max-history-chars` | 6000 | Character budget for that replayed history, independent of turn count. |
| `turn-deadline-seconds` | 45 | The **shared** budget for an entire turn's Mistral calls (embed + chat + any retries) — not a per-call timeout. The frontend's own request timeout is 60s, comfortably above this. |

### `retention.*`

See [operations.md#retention](operations.md#retention) for what the nightly job actually deletes.

## Disabling live data only

`app.ai.live-data-enabled=false` turns off `AssistantDataService` entirely while leaving knowledge
retrieval and chat fully functional — the assistant still answers "how do I…" questions, it just
never fetches or injects the asker's own EOD/approval/utilization figures. Independent from
`enabled`, which is the full on/off switch.

## Rate limits and billing settings

These are **not** in `application.yml` — they're runtime-editable via the Super Admin ops page
(`/admin/ai`) or its underlying `GET`/`PUT /api/ai-assistant/admin/rate-limit-settings` and
`/admin/billing-settings` endpoints, backed by the singleton `ai_rate_limit_settings` and
`ai_billing_settings` rows (seeded by V95). See [operations.md](operations.md) for the operational
side of these.
