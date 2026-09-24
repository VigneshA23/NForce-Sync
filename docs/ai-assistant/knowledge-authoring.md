# Knowledge Authoring

The assistant's knowledge is hand-authored YAML under
`backend/src/main/resources/ai-knowledge/` — never CLAUDE.md, never the prototype HTML files, and
never inferred. Every fact should be traceable back to actual Sync source code.

## Directory layout

```
ai-knowledge/
  pages/registry.yaml     # navigation registry — NOT knowledge, excluded from indexing
  foundations/            # what Sync is, the EOD lifecycle, terminology (TERM units)
  roles/                  # per-role overview units
  modules/                # module-level overviews
  pages/*.yaml            # PAGE units, one family of files per page/module
  actions/                # ACTION units — how to do a specific thing
  workflows/              # WORKFLOW units — multi-step processes spanning roles
  errors/                 # ERROR units — why an action was refused, with verbatim messages
```

`pages/registry.yaml` lives in the same top-level folder as PAGE knowledge units but is loaded by
`PageRegistry`, not `YamlKnowledgeSource` — it's the navigation contract described in
[architecture.md](architecture.md#navigation-pageid-never-a-url), not a knowledge source.

## The YAML schema

```yaml
knowledge:
  - knowledgeId: eod.error.approvals.validation   # unique, stable, dotted
    type: ERROR                                    # FOUNDATION | ROLE | MODULE | PAGE | ACTION | WORKFLOW | ERROR | FAQ | TERM
    module: approvals                              # optional, free text — groups for retrieval boosts
    pageId: eod-inbox                               # optional — must exist in registry.yaml if set
    actionId: ...                                   # optional
    workflowId: ...                                 # optional
    version: 1                                      # required, >= 1
    audience: [MANAGER, PM, SUPERADMIN]              # required, non-empty, backend AppUser.Role values
    title: Approval action errors                    # required
    synonyms:                                        # optional — alternate phrasings, folded into the embedded text
      - why can't I approve this
    sources:                                          # required for PAGE / ACTION / WORKFLOW / ERROR
      - backend/src/main/java/com/nforceone/sync/approval/ApprovalService.java
    errorMessages:                                     # required for ERROR — VERBATIM strings from the source
      - "Entry must be in SUBMITTED status; current: {status}"
    body: |
      The actual prose the model retrieves and answers from. 40–4000 characters.
```

### Field rules, exactly as `KnowledgeSchemaValidator` enforces them

- `knowledgeId` — required, must be unique across every loaded document. A duplicate silently
  overwrites the earlier unit at upsert time (same id, chunk ordinal 0), which is the most
  damaging kind of drift to let through unreported — so the validator rejects it outright rather
  than warning.
- `type` — required, must be a real `KnowledgeType`.
- `audience` — required and **non-empty**. An untagged unit is fail-closed (visible to nobody),
  never a fallback to visible-to-everyone. If you forget this field, the unit simply never
  surfaces for anyone — it will not silently leak to the wrong role.
- `body` — 40–4000 characters after trimming. Too short and it still embeds to a valid vector and
  can win a retrieval slot while answering nothing; too long and you should split it by hand into
  two properly-titled units rather than relying on the chunker's paragraph-boundary fallback.
- `title` — required.
- `version` — required, `>= 1`.
- `pageId` (optional) — if set:
  - it must exist in `registry.yaml` (`PageRegistry.exists`);
  - **every role in this unit's `audience` must have a non-placeholder variant of that `pageId`**.
    This is the check that caught a real content bug during authoring: role-definition units for
    DM/FINANCE/LEADERSHIP had `pageId: dashboard` attached as a navigation hint, but `dashboard` is
    a *placeholder* for those roles — the validator correctly rejected it. Don't attach a `pageId`
    "for context" to a unit whose audience includes a role that can't actually reach it.
- `sources` — required (non-empty) for `PAGE`, `ACTION`, `WORKFLOW`, `ERROR` types. Repo-relative
  paths to the controller/service/DTO file(s) the unit was actually authored from.
  `KnowledgeSourceTraceabilityTest` checks these paths exist on disk at **build time only** — the
  runtime validator (`KnowledgeSchemaValidator`) is deliberately filesystem-free, because a reindex
  can run against a deployed instance where the repo source tree doesn't exist at all.
- `errorMessages` — required (non-empty) for `ERROR` type, and must be the **verbatim** strings
  from the Java source (`KnowledgeSourceTraceabilityTest` checks each one appears literally in
  `src/main/java`, split on format placeholders like `{status}`).

## Writing style

Look at `foundations/*.yaml` for the reference tone: plain, factual, second-person where it helps
("you can..."), no marketing language, no hedging where the code is unambiguous. State exact
statuses, exact field names, exact rules — the model paraphrases from this text, so vague prose
here produces vague or wrong answers downstream.

Every non-trivial claim should be re-verified against the actual source before writing it, not
copied from an existing doc or from memory of how a similar system works. During M4 authoring,
several claims from the OneHR reference and from CLAUDE.md turned out to be wrong for Sync
specifically (see the plan's §2a corrections, e.g. C4, C5, C6) — always check the current
`EodService`/`ApprovalService`/etc. directly.

## Terminology (TERM units)

Sync's own vocabulary needs explicit disambiguation the model can't infer:
- "Manager" is ambiguous — could mean the direct reporting manager (backend role `MANAGER`,
  frontend label "Team Lead") or a Project Manager (`PM`), a completely different role. TERM units
  instruct the model to disambiguate rather than guess when a question uses "manager" alone.
- Avoid adding a synonym that maps to the wrong feature — e.g. don't add "timesheet" as a synonym
  for EOD unless the actual UI uses that word somewhere; a plausible-sounding synonym that doesn't
  match Sync's real terminology will retrieve the right chunk for the wrong reason, and mislead the
  model's phrasing back to the user.

## Reindexing after a change

Nothing indexes automatically. After editing any YAML under `ai-knowledge/`, a SUPERADMIN must call
`POST /api/ai-assistant/admin/reindex` (or use the "Re-index" button on `/admin/ai`). See
[operations.md](operations.md#reindexing) for what that does and how to read its result, including
what happens if the YAML fails validation (nothing is written — the old index stays intact) and how
unchanged chunks are skipped from re-embedding (I2, keyed by content hash).

## Eval fixtures

`backend/src/test/resources/ai-eval/questions.yaml` holds the static question fixtures used by
`AiEvaluationSetTest` (validated with no API calls) and, when run live, by
`AiEvaluationHarness` (see [operations.md](operations.md#the-live-eval-harness)). When you add
meaningfully new knowledge, consider adding a matching eval question so regressions in retrieval
or phrasing show up in the scorecard.
