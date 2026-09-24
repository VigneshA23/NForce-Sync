# Architecture

## Package layout

`backend/src/main/java/com/nforceone/sync/ai/`

| Package | Contents |
|---|---|
| `config/` | `AiProperties` (`@ConfigurationProperties("app.ai")`), `AiConfig` |
| `contract/` | Provider-neutral interfaces and records: `LlmProvider`, `EmbeddingProvider`, `KnowledgeRetriever`, `KnowledgeIndexRepository`, `AssistantResponse`, `AssistantResponseType`, `ConfidenceLevel`, `KnowledgeDocument`, `KnowledgeChunk`, `RetrievalQuery`, `RetrievalResult`, `PageReference`, `NavigationAction`, `RelatedItem`, `RoleLabels` |
| `controller/` | `AiAssistantController` — the only `@RestController` in the package |
| `data/` | `AssistantDataProvider` (SPI), `AssistantDataService` (selection), `*DataProviders` (the 17 concrete read-only providers, package-private nested statics) |
| `dto/` | Request/response records for chat, feedback, health, usage, billing, settings |
| `entity/` | JPA entities: `AiConversation`, `AiConversationMessage`, `AiInteractionLog`, `AiRateLimitSettings`, `AiBillingSettings` |
| `exception/` | `AiExceptionHandler` and the AI-specific exception types |
| `index/` | `PgVectorKnowledgeIndexRepository` — JdbcTemplate, not JPA, by design (see below) |
| `knowledge/` | `KnowledgeSource`, `YamlKnowledgeSource`, `KnowledgeSchemaValidator`, `KnowledgeChunker`, `KnowledgeIndexingService` |
| `navigation/` | `PageRegistry`, `NavigationValidator` |
| `observability/` | `AiInteractionLogger`, `AiRetentionJob` |
| `prompt/` | `PromptBuilder`, `SystemPromptTemplate`, `PromptFences` |
| `provider/mistral/` | `MistralHttpClient`, `MistralLlmProvider`, `MistralEmbeddingProvider` |
| `repository/` | JPA repositories — deliberately narrow interfaces, see below |
| `response/` | `ResponseValidator`, `UnknownResponses` |
| `retrieval/` | `VectorKnowledgeRetriever` |
| `service/` | `AiAssistantService` (the orchestrator), `ConversationService`, `AiRateLimiter`, `AiRateLimitSettingsService`, `AiBillingSettingsService`, `AiUsageStatsService` |
| `action/` | The inert write-action framework — see [action-execution.md](action-execution.md) |

## Turn flow (`AiAssistantService.chat`)

Every failure path returns HTTP 200 with a controlled `UNKNOWN` response, **except** rate limiting
(429). No exception from this package is ever allowed to reach `/error` — see
[Read-only guarantee](#read-only-guarantee) and C16 in the plan for why that matters specifically
in Sync (any non-login 401 logs the user out client-side).

1. Resolve the caller's email from `Principal.getName()`.
2. If the assistant is disabled or unconfigured (no usable key) → `UNKNOWN` / `DISABLED`, no DB
   work at all.
3. Load the user fresh from the DB (`AppUserRepository.findByEmailAndDeletedAtIsNull`). Soft-deleted
   or `INACTIVE` → `UNKNOWN` / `INACTIVE_USER`. (The JWT's role can be up to 8h stale in Sync —
   this re-resolves every turn rather than trusting the token's claims for anything but auth.)
4. Build the request context: `userId`, `email`, `role`, `roleLabel`.
5. Trim and validate the message: empty → `EMPTY_MESSAGE`; over 1000 chars → `MESSAGE_TOO_LONG`.
6. Check the per-user rate limit — throws, becomes HTTP 429 with `Retry-After` and a
   `retryAt`/`retryAfterSeconds` body.
7. Validate `currentPageId` (if supplied) against the registry for this role; drop it silently if
   invalid rather than failing the turn.
8. Resolve the conversation: an owner-scoped lookup by id. A foreign, missing, or invalid id
   silently starts a new conversation rather than erroring.
9. **Retrieve** (`VectorKnowledgeRetriever`):
   - Fetch prior conversation history first (needed for the follow-up blend below).
   - Embed the question — if the current message is short (<80 chars) and history exists, blend in
     the previous user question for embedding purposes only (never shown to the user, never sent
     as "the question" to the LLM). See the follow-up-context section below.
   - Over-fetch ~24 candidate chunks with the audience (role) filter applied *inside* the SQL kNN
     query, not after.
   - Apply score boosts: +0.05 if the chunk's `pageId` matches `currentPageId`, +0.03 if its
     `module` matches a module implied by the question/current page.
   - Deduplicate to the single best-scoring chunk per `knowledgeId`.
   - Keep the top 8 by score, subject to a 12,000-character total budget.
   - Any failure here → `UNKNOWN` / `RETRIEVAL_UNAVAILABLE`.
10. Empty retrieval result → `UNKNOWN` / `NO_KNOWLEDGE`, logged, **no LLM call is made** — this is
    the main safeguard against off-topic answers and wasted spend.
11. **Live data** (`AssistantDataService`): pick eligible providers for this role from the modules
    implied by retrieval plus the current page (page match weighted 0.75), at most 3 per turn,
    round-robined across provider "families" so one chatty module can't crowd out the rest. A
    single provider's failure only drops that section — it never fails the turn.
12. **Build prompts** (`PromptBuilder`):
    - System prompt: policy/behavior rules, the user's role, the validated current page, the list
      of pages this role can actually reach, the list of not-yet-available (placeholder) pages,
      `<userdata>` (live data), `<knowledge>` (retrieved chunks) — each block fenced and neutralized
      against injection (see below).
    - User message: `<history>` (bounded to `max-history-turns`/`max-history-chars`), then the
      current (untouched, unblended) question.
13. Call Mistral in JSON mode, subject to the shared per-turn deadline (default 45s) that all
    retries must fit inside. A failure here → `UNKNOWN` / `PROVIDER_UNAVAILABLE`.
14. `ResponseValidator`: parse leniently, coerce/drop unknown fields, run the claimed-action guard
    (rewrites any first-person "I have/I've approved/submitted/rejected/…" claim to the standard
    read-only decline — the model has no way to have actually done that, so it must never claim to
    have). `NavigationValidator` re-checks any returned `pageId` against the registry for this role
    and its placeholder status. Malformed model output → `UNKNOWN` / `MALFORMED_OUTPUT`.
15. Persist the turn (`ConversationService`), which yields a `messageId` used later for feedback.
16. Write one `ai_interaction_log` row — metadata and metrics only, no message text — swallowing
    its own errors so logging can never fail a turn.
17. Return the `AssistantResponse`.

## Read-only guarantee

The assistant writes to exactly two places:
- Its own `ai_*` tables (conversations, messages, interaction logs, settings).
- `audit_log`, only when a SUPERADMIN changes rate-limit or billing settings through the admin
  endpoints — the same audit convention every other admin action in Sync already follows.

It never writes to `eod_entry`, `approval_action`, `allocation`, `app_user`, or any other
application table. This isn't just a code-review convention — it's enforced structurally in two
independent ways:

1. **The `action/` package is fully inert.** It exists (10 classes, documented with 8
   machine-checked guarantees in its `package-info.java`) as the seam a future write-capable
   action would plug into, but nothing currently calls it, and `ActionRegistry` holds an immutable
   empty `Map.of()`. `ActionFrameworkDisabledTest` scans the package at test time and fails if
   anything wires it up. See [action-execution.md](action-execution.md).
2. **Every live-data provider is self-scoped by construction.** Each of the 17 `*DataProviders`
   passes only the caller's own `userId`/email into an existing Sync service method — never an
   id supplied by the model or extracted from the question. `DataProviderSafetyTest` uses Mockito
   to verify, per provider, the *exact* method called with the *exact* caller-scoped argument, then
   asserts no other interaction happened. See [live-data.md](live-data.md).

## Why `PgVectorKnowledgeIndexRepository` is JdbcTemplate, not JPA

The knowledge-chunk tables (`ai_knowledge_chunk`, `ai_knowledge_chunk_audience`) are the one part
of this schema deliberately kept outside Hibernate. Reasons:
- The `vector(1024)` column type and `<=>` cosine-distance operator have no natural JPA/Hibernate
  mapping without a custom dialect.
- Reindexing is a bulk, transactional, delete-then-upsert operation better expressed as hand-tuned
  parameterized SQL than as entity graph management.
- Keeping it outside the entity layer makes the "the assistant reads via services, not raw
  repositories" boundary for *application* data even more explicit — the one place raw SQL is used
  is entirely inside the assistant's own tables.

## Prompt-injection defenses

Untrusted or semi-trusted text — retrieved knowledge, live data, and conversation history — is
never concatenated into the prompt raw. `PromptFences` case-insensitively neutralizes any
occurrence of the fence markers themselves (`<knowledge`, `<userdata`, `<history>` and their
closing tags) inside content before it's wrapped in the real fences, so a knowledge unit or a past
user message can't forge a fence boundary and smuggle in fake instructions — including
**second-order** injection via conversation history, which is replayed through the same sanitizer
every time, not just sanitized once at write time.

On the output side, `ResponseValidator`'s claimed-action guard (I19) catches the other direction:
even a fully "honest" model can still phrase a hypothetical or a hallucinated completion as
"I've submitted that for you" — this is rewritten before the response ever reaches the user.

## Navigation: `pageId`, never a URL

The model is never asked for, and never allowed to return, a raw route. It returns a `pageId` — a
stable identifier from `ai-knowledge/pages/registry.yaml` — which is validated server-side
(`NavigationValidator`: does the page exist, does this role have a non-placeholder variant of it)
and then, independently, resolved to an actual Sync route on the frontend
(`frontend/src/lib/ai/pageTargets.ts`), which re-checks the resolved route against the *live*
`nav.ts` for that role before ever rendering a "go there" link. A `pageId` can be stale in one of
these two places for at most one deploy; a raw URL from the model would have no such check at all.

## Retention

A nightly job (`AiRetentionJob`, default `0 30 2 * * *`) deletes conversation messages older than
90 days and interaction-log rows older than 365 days (both configurable under
`app.ai.retention`). See [configuration.md](configuration.md) and
[operations.md](operations.md#retention).
