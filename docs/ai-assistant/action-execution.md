# Action Execution (Inert by Design)

`ai/action/` is a write-action extension point that exists today and does **nothing**. This is not
a feature flag someone can flip on — it is enforced by what does and does not exist in the
package, and `ActionFrameworkDisabledTest` fails the build if any of the guarantees below are
weakened.

## Why build an inert framework at all

Two reasons:
1. It documents, in code, exactly what a future write-capable action would need to satisfy before
   it could ship — the shape is real even though nothing implements it.
2. It gives the response contract and prompt system a stable place to *not* put an action field
   today, so adding one later is additive rather than a breaking contract change.

## The 8 guarantees (from `action/package-info.java`, each asserted by `ActionFrameworkDisabledTest`)

1. `ActionDefinition` is pure metadata — it has no `execute` method. Holding one gives a caller no
   way to run anything.
2. There are **zero implementations** of `ActionDefinition` anywhere in `src/main`. The contract
   exists; nothing implements it. Asserted via a classpath scan.
3. `ActionRegistry` is `final` and holds `Map.of()` — an immutable empty map. It deliberately does
   **not** autowire a `List<ActionDefinition>` from Spring's context, because bean collection would
   let a future `@Component` silently register itself into the registry without anyone touching
   this class.
4. `DisabledActionExecutor` is the only `ActionExecutor` implementation and throws
   unconditionally. There is no enable flag — it ignores `ActionDefinition.enabled()` entirely,
   because an enable flag can be flipped by mistake and this must not be flippable.
5. No HTTP endpoint accepts an `ActionRequest` — not even a stub that returns 501. An endpoint that
   *looks* real, even if it currently errors, invites a client integration to start calling it.
6. `AssistantResponse` has no action field, and any unrecognized field the model invents in its
   JSON output is dropped during `ResponseValidator` parsing, not merely ignored on the wire.
7. Nothing in `com.nforceone.sync.ai` uses reflection, SpEL, dynamic bean lookup, or
   model-supplied SQL/URLs. Retrieval is parameterized JDBC only, with the model's query text
   embedded (turned into a vector), never interpolated into SQL. Navigation returns a `pageId`,
   never a route.
8. The assistant reaches no write path outside its own tables. Its only writes are conversation,
   feedback, and telemetry rows in `ai_*` tables (plus `audit_log` for a Super Admin settings
   change). Live-data providers call read-only service methods only, self-scoped to the caller —
   see [live-data.md](live-data.md) and `DataProviderSafetyTest`, which verifies this with Mockito
   rather than assuming it from the provider's name.

## Classes in the package

| Class | Role |
|---|---|
| `ActionDefinition` | Metadata-only description of a potential action (id, label, parameters) — no execution capability |
| `ActionParameter` | A typed parameter description for an `ActionDefinition` |
| `ActionAuthorization` | Describes what authorization an action would require, if it existed |
| `ActionRequest` | What a caller would submit to run an action — accepted by no endpoint today |
| `ActionConfirmation` | A would-be confirmation step, for actions requiring explicit user confirmation before executing |
| `ActionExecutor` | The interface a real executor would implement |
| `DisabledActionExecutor` | The only implementation; throws unconditionally |
| `ActionRegistry` | `final`, holds `Map.of()` |
| `ActionResult` / `ActionOutcome` | What a completed action's result would look like |

## If this is ever built out for real

The plan's own intended future progression (none of it wired today, and none of it should be
started without a fresh design/security review, not just "unbreak one guarantee at a time"):

read-only (today) → intent recognition (model proposes an action, still can't run it) → draft
(a structured, human-reviewable preview of what would happen) → confirmation (explicit user
approval of the exact draft) → execution (finally, an actual write, scoped as narrowly as the
live-data providers are today).

Any change to this package should be treated as a security-relevant change to Sync, not a chatbot
feature — get a second pass on it specifically for the guarantees above, not just functional
correctness.
