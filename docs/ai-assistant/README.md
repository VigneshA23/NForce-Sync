# NForce Sync AI Support Assistant

An authenticated, Sync-only support chatbot: a floating launcher available to every signed-in
user, answering "how do I…" / "what is…" / "take me to…" questions from Sync's own knowledge base,
optionally grounded in the asker's own live data (their EOD status, pending approvals, etc.).

Built 2026-09-24, adapted from an equivalent assistant in the OneHR codebase but re-derived
against Sync's actual code, role model, and frontend conventions — not ported wholesale. The full
rationale and every correction made against the original two planning documents lives in the
approved implementation plan at
`C:\Users\SRAVANI PILLA\.claude\plans\i-have-attached-the-hidden-bird.md`; these docs describe the
system as built, not the planning process.

## Start here, by question

| I want to… | Read |
|---|---|
| Understand how a chat turn works end to end | [architecture.md](architecture.md) |
| Change a setting, key, or limit | [configuration.md](configuration.md) |
| Add or edit a knowledge unit (YAML) | [knowledge-authoring.md](knowledge-authoring.md) |
| Add a new live-data provider, or understand the self-scoping guarantee | [live-data.md](live-data.md) |
| Run it day to day: reindex, health, rate limits, billing, retention, the eval harness | [operations.md](operations.md) |
| Understand the (currently inert) write-action framework | [action-execution.md](action-execution.md) |

## The one invariant that matters most

**The assistant never mutates Sync data, and it never tells the model a route it can act on.**
Every other design choice in this system — the inert `action/` package, the `pageId`-not-URL
navigation contract, the self-scoped data providers, the claimed-action response guard — exists to
make that invariant true *structurally*, not just by convention. If you're extending this system
and a change would blur that line, stop and re-read
[architecture.md](architecture.md#read-only-guarantee) and
[action-execution.md](action-execution.md) first.

## Known limitations (by design, not oversight)

- No streaming — a chat call is a single request/response, up to a 45s server-side deadline and a
  60s frontend timeout.
- No cross-conversation memory — each conversation is its own thread; there is no long-term user
  profile.
- Billing figures are a same-model-family cost **estimate**, not Mistral's actual invoice — labeled
  as such everywhere it's shown.
- DM, Finance and Leadership roles get knowledge and the launcher, but no live-data providers and
  no real pages to navigate to (those roles are placeholder-only in Sync itself today).
- A handful of pre-existing Sync bugs (the `/help` 403, some search-routing issues) were found
  during knowledge authoring and were explicitly **left alone** — out of scope for this build. The
  assistant's knowledge describes Sync's actual current behavior, bugs included, rather than
  silently working around them.
