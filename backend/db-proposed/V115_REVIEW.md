# V115 review — per-piece EOD clarification

Status: PROPOSED. Not applied anywhere (not on the shared database, not on any branch). Not in `src/main/resources/db/migration`. Nothing committed or pushed.

## 1. V115 SQL (`V115__eod_clarification_piece_id.sql`)

```sql
ALTER TABLE eod_clarification
    ADD COLUMN piece_id BIGINT NULL REFERENCES eod_project_approval(id);

CREATE INDEX idx_eod_clarification_piece ON eod_clarification(piece_id);

-- At most one open round per piece. Legacy rows (piece_id NULL) keep the old per-entry rule.
CREATE UNIQUE INDEX idx_eod_clarification_open_per_piece
    ON eod_clarification(piece_id) WHERE status <> 'RESOLVED' AND piece_id IS NOT NULL;
```

## 2. Backfill SQL (second half of the same file; unchanged, no guessing rule)

```sql
-- Map a round to the CURRENT-cycle piece its opener holds (as approver or escalated-to) on the
-- same entry, only when that is unambiguous (exactly one such piece). Otherwise piece_id stays NULL
-- and the round keeps the old per-entry behaviour.
WITH candidates AS (
    SELECT c.id AS clarification_id,
           p.id AS piece_id,
           COUNT(*) OVER (PARTITION BY c.id) AS n
    FROM eod_clarification c
    JOIN eod_project_approval p
      ON p.eod_entry_id = c.eod_entry_id
     AND p.superseded_at IS NULL
     AND (p.approver_id = c.opened_by_id OR p.escalated_to_id = c.opened_by_id)
    WHERE c.piece_id IS NULL
)
UPDATE eod_clarification c
SET piece_id = candidates.piece_id
FROM candidates
WHERE candidates.clarification_id = c.id
  AND candidates.n = 1;
```

Rounds that cannot be mapped with certainty stay `piece_id` NULL. There is deliberately no "pick the pending piece" rule: the data cannot prove which piece an old round was about, and a guess would hide ambiguous cases.

## 3. Dry-run numbers (read-only SELECTs on the shared dev database, 2026-10-19; no message text read)

- Flyway version 114. 11 clarification rounds: 8 open, 3 resolved (26, 27, 32).
- Would map to a piece: 10. Would stay `piece_id` NULL: 1 (round 31).
- Open rounds and where they attach after the backfill:

| Round | Entry | Opened by | Attaches to |
|---|---|---|---|
| 28 | 2306 | Vignesh Appani (160) | piece 2551, SYNC |
| 29 | 2362 | Vignesh Appani (160) | piece 2615, SYNC |
| 30 | 2355 | Vignesh Appani (160) | piece 2606, SYNC |
| 31 | 2357 | Vignesh Appani (160) | NULL (ambiguous, see section 4) |
| 33 | 1861 | Suhita K (158) | piece 2079 (no project) |
| 34 | 2347 | Naveen (154) | piece 2595 (no project) |
| 35 | 2370 | Vignesh Appani (160) | piece 2620, SYNC |
| 36 | 2386 | Akash T (161) | piece 2639, ARENA |

- Effect on Vignesh's 6 pending cards that sit on an entry with an open round: 5 stay blocked (rounds he opened himself on his own SYNC pieces: 28, 29, 30, 35; and the legacy round 31). 1 unblocks: entry 2386 (Sravani Pilla, SYNC piece 2640), because round 36 was opened by Akash on ARENA.

## 4. Known ambiguous case: round 31

- Round 31: entry 2357 (Sai Ganesh Rodda, entry date 2026-10-07, entry status PARTIALLY_APPROVED), status NEEDS_RESPONSE, opened 2026-10-09 by user 160 (Vignesh Appani, who leads SYNC and ONEHR), 1 message from the opener, no employee reply.
- Why the backfill leaves it NULL: user 160 holds two current pieces on that entry — ONEHR piece 2608 (PENDING) and SYNC piece 2609 (APPROVED) — so the mapping is not unique.
- It is the ONLY round that stays NULL. It is not resolved and not changed by V115.
- On the shared database: undecided (separate decision, after the branch test).

### Branch-only manual attach (NOT part of V115; run only on the Neon branch, never on the shared database)

Decision: on the branch only, attach round 31 to ONEHR piece 2608 by hand, and do NOT resolve it, to observe how an old round on a pending piece behaves after V115.

Before (SELECT, expect `piece_id` NULL):

```sql
SELECT c.id, c.eod_entry_id, c.status, c.opened_by_id, c.piece_id, p.project_id
FROM eod_clarification c
LEFT JOIN eod_project_approval p ON p.id = c.piece_id
WHERE c.id = 31;
```

The statement (exactly one row expected; it only matches if piece 2608 belongs to the same entry and the round is still unmapped):

```sql
UPDATE eod_clarification c
SET piece_id = p.id
FROM eod_project_approval p
WHERE c.id = 31
  AND c.piece_id IS NULL
  AND p.id = 2608
  AND p.eod_entry_id = c.eod_entry_id;
```

After (same SELECT as "Before", expect `piece_id` = 2608 and `project_id` = the ONEHR project, `status` still NEEDS_RESPONSE).

## 5. Additive / backward-compatible confirmation

- V115 adds a nullable column, a plain index and a partial unique index. It drops and alters nothing.
- The old per-entry unique index `idx_eod_clarification_open_per_entry` is KEPT, so the database still allows only one open round per entry after V115.
- The currently deployed backend does not map `piece_id` (`ddl-auto: none`) and its inserts leave it NULL, so it should keep working. This is reasoned, not yet tested — the branch test is where it gets proven.
- V116 (separate file `V116__eod_clarification_replace_entry_index.sql`, only after the V115 backfill is verified) drops the old index and adds `CREATE UNIQUE INDEX idx_eod_clarification_open_legacy_per_entry ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED' AND piece_id IS NULL`. After V116 two open rounds can exist on one entry, which the old backend's single-result lookup cannot handle — deploy the new backend first.
- Until V115 is applied, the new backend's `EodClarification.piece` mapping makes clarification queries fail against that database. Do not start the new backend against a database without V115.

## 6. Neon branch plan

0. Nothing runs until the reviewer has read this file and says go.
1. Create a branch of the shared database in the Neon console (copy-on-write).
2. Give the session the branch connection through local environment variables, never pasted in chat. To avoid overriding the shared-database configuration of anything else on this machine, use dedicated names: `NEON_BRANCH_URL`, `NEON_BRANCH_USER`, `NEON_BRANCH_PASSWORD`. The session maps them to `SPRING_DATASOURCE_*` for the single backend process it starts, and checks only that they are set — it never prints their values.
3. Stop the backend that is currently running against the shared database (it is the pushed `dev` code, commit 7996143, without the clarification work). Do not restart it against the shared database with the new code. The new backend is started only against the branch.
4. Apply V115 on the branch. Verify: 11 rounds, 10 mapped, round 31 NULL; rounds 28, 29, 30 and 35 mapped to their SYNC pieces (2551, 2615, 2606, 2620) as examples of old rounds the backfill maps.
5. Run the "Before" SELECT, the round 31 UPDATE and the "After" SELECT from section 4 (branch only). Do not resolve round 31. Observe how it behaves as an old round on a pending piece (blocks piece 2608 only; the already-approved SYNC piece is unaffected).
6. Start the currently deployed backend build against the branch; confirm login, Approvals, approve and reject work.
6b. Flyway failure-injection test (branch only, approved). Before the real V116: with V115 applied and the old index still present, run Flyway with `backend/db-proposed/branch-test/V116__failure_injection.sql` (a copy of V116 with a deliberately failing third statement, `SELECT 1 / 0;`) as an extra location outside `db/migration` — for example by starting the backend against the branch with the extra Flyway location set through the environment, never through `mvn flyway:*` and never against the shared database. Expected: the migration fails; the DROP INDEX is rolled back; `idx_eod_clarification_open_per_entry` is still present; `idx_eod_clarification_open_legacy_per_entry` is absent; no row 116 in `flyway_schema_history`. Report exactly what was observed. Then delete the `branch-test` folder.
7. Apply the real V116 on the branch. Start the NEW backend against the branch only.
8. Test with Akash (ARENA lead, user 161), Vignesh (SYNC lead, user 160) and Sravani (employee, user 166): each lead opens their own round on one EOD; the other lead can still approve and reject; each sees only their own thread; the employee sees both and can pick; resolving one leaves the other open. Include the existing rounds 28, 29, 30 and 35 (mapped) and 36 (Akash, ARENA, unblocks Vignesh's SYNC card on entry 2386).
9. Only after that passes, the reviewer approves the shared database: V115 first, verify, deploy the new backend everywhere (section 8), and only then V116.
10. Delete the branch.

Step 6 report (to be filled in when run): exactly which build was started (commit 7996143, the pushed `dev`), against which branch, which pages and calls were exercised (login, Approvals list, approve, reject, an existing open round on a card, open-clarification chat), and what happened — success or exact error. It has not been run yet.

## 6a. How the migrations are applied on the branch (approved) and the order

- V115 and V116 are NOT moved into `db/migration`. Each is applied through an extra Flyway location outside it, set by environment variable, one folder per phase, each containing exactly the one intended file (a byte-identical copy, checked by SHA-256): a V115 folder, the failure-injection folder, then a V116 folder. `db-proposed/` itself is never used as a location (it also holds the V116 file and a non-migration file whose name Flyway could misread).
- Never `mvn flyway:*`, never against the shared database.
- Order on the branch: (a) apply V115 and verify: 11 rounds, 10 mapped, round 31 NULL, rounds 28/29/30/35 mapped; (b) round 31 before/update/after; (c) run the OLD backend build (commit 7996143) against the branch and report exactly what was tested; (d) failure-injection test, confirm the DROP INDEX rolled back and no row for the failed version is left in `flyway_schema_history`, then delete the `branch-test` folder; (e) apply the real V116; (f) start the new backend and test with Akash, Vignesh and Sravani; (g) cross-thread check: Vignesh opens Akash's thread by id, through the UI and by URL, and gets 403 or an empty state, and Akash does the same with Vignesh's.
- Before step (a): stop the scratch backend, then delete the scratch copies of the config files (list file names only to confirm).

## 7. Rounds that stay `piece_id` NULL (legacy): implemented — a legacy round is its opener's alone

Code change made (working tree only, not committed). For a round with `piece_id` NULL:

- Visible and writable only to its opener and the employee. Other current approvers on the entry lose access: another project's lead cannot read, post in, resolve or mark-read it (403), and it does not appear in their inbox.
- Super Admin, the frozen reporting manager and a project PM can read it, read-only — exactly what they can already do for a piece-keyed round (see below). Super Admin can still not write (existing rule: writing needs a real reviewing capacity).
- It blocks approve/reject only on the PENDING pieces held by its opener (piece approver = opener). It never blocks another lead's piece, so a lead is never blocked by a thread they cannot see.
- It stops only its own opener from opening another round on the entry; another lead can open theirs.
- A reply from the employee notifies the opener only, never another project's lead.

What the read-only roles can see for PIECE-KEYED rounds today (unchanged, and the model legacy rounds now follow): the frozen reporting manager (the entry's manager), a project PM (any project on the entry's tasks) and Super Admin can READ every round on the entry, whichever piece it belongs to; they can never open, reply to or resolve one. A lead who is also the PM of a project on the entry gets that read access through the PM capacity (as before) — not through being a lead.

Known edge cases:
- A legacy round whose opener no longer holds a pending piece can no longer be replied to or resolved by anyone, but it then blocks nothing (it blocks only the opener's pending pieces).
- A legacy round never blocks a pending piece that is currently escalated to someone else (a PM): "held by the opener" means the opener is the designated approver AND the piece is not escalated to anyone else. A piece the opener still holds stays blocked. (Fixed and tested: the PM, and the opener acting on his own escalated piece, can decide it; the legacy round no longer applies to that piece's card.)

Tests added or rewritten: another lead cannot read, post in, resolve or mark-read a legacy round, and is not blocked by it (service and approve/reject gate); the opener and the employee still can, and a reply pings only the opener; the frozen reporting manager reads it read-only; a lead of two projects who opened a legacy round stays blocked on both of his pending pieces; the single-project flows (piece-keyed and the existing 42-test suite) are unchanged.

Round 31 stays listed as the known ambiguous case (section 4). With this rule it blocks only Vignesh's pending pieces on entry 2357 (ONEHR 2608); both pieces on that entry are his, so nobody else is affected.

## 8. Deploy order (required) and where the old backend could still be running

V116 allows two open rounds on one entry, which the OLD backend cannot handle (its single-result lookup throws on such an entry). So the order is:

1. V115 (additive; the old backend keeps working).
2. Deploy the NEW backend everywhere that talks to this database.
3. Only then V116.

Before V116 reaches the shared database, every one of these must be confirmed updated (found so far — I cannot see anyone's machine):

- The production Railway backend (`nforce-sync-production`), which `vercel.json` rewrites `/api/*` to and which, per `docs/role-restructure-plan.md`, uses this database's credentials.
- Vercel: frontend only, no backend. Production and preview builds exist only for the `main` and `dev` branches and both call the Railway backend above; nothing to deploy there for the backend, but the new frontend only works fully once Railway runs the new backend.
- Teammates' local backends (`start-backend.bat` / `mvnw spring-boot:run` with their own gitignored `application-local.yml`). A read-only look at the live connections showed 8 distinct JDBC clients on the database; their owners are not identifiable from here. Each person must pull and restart.
- Any other deployment or CI job: none found in the repository (no CI workflow files, no other deploy config).
- The scratch backend this session started from the pushed `dev` commit — to be stopped when the branch variables are set (it is the pre-clarification build).

Confirmation needed from the owner of each item before V116.

## 9. Status

- No V115 or V116 anywhere. No commit, no push. `backend/db-proposed/` is untracked: keep it out of any commit.
- This file contains no host names, credentials or message text.

## 10. Flyway runs each migration in one transaction (V116 cannot half-apply)

- Configuration (application.yml): `spring.flyway` has only `enabled`, `locations`, `baseline-on-migrate` and `validate-on-migrate`. No `group`, no `mixed`, no per-script transaction opt-out, and no `CREATE INDEX CONCURRENTLY` anywhere in the migrations (the only "flyway" text in the migrations is a comment in V84).
- Flyway's default on PostgreSQL is to run each versioned migration inside a single transaction, and PostgreSQL supports transactional DDL. So in V116 a failure at `CREATE UNIQUE INDEX` rolls back the `DROP INDEX` too: the old index is restored, never left dropped with the new one missing.
- Precedent: V87 already swapped this very index with the same two statements (DROP INDEX, CREATE UNIQUE INDEX).
- This is from configuration and Flyway's documented default, not yet observed. The branch test can prove it: run a copy of V116 with a deliberately failing third statement and confirm the old index is still present afterwards.
- Caveat: both statements take locks while they run (DROP INDEX takes an exclusive lock on the table; a non-concurrent CREATE UNIQUE INDEX blocks writes while it builds). The table is tiny (11 rows today), so this is momentary.
- Foreign key in V115: `REFERENCES eod_project_approval(id)` with no ON DELETE clause, i.e. the default NO ACTION, the same as the existing V97 reference to the same table. No code or migration deletes approval pieces (they are superseded, never deleted), so it cannot get in the way.

### Dependence on credentials, roles and grants

V115 and V116 contain no GRANT, REVOKE, OWNER, ROLE, SET ROLE, AUTHORIZATION, password or user text (checked by search, no matches). They only add a column and indexes and drop one index, so they depend on no credential or role name. They must run as a role that owns `eod_clarification` (the application's owner role does today). A new column is covered by existing TABLE-level grants; only COLUMN-level grants would not be. To confirm no column-level grants exist, run a read-only query of the table's grants on the Neon BRANCH (not the shared database) before applying V115.

### Credentials found in the repository (file and line only; no values)

See the chat report for the list; do not add values to this file.

## 11. Appendix: full text of the three files (`cat -n`, wrapped at 100 columns)

### V115__eod_clarification_piece_id.sql

```sql
     1	-- PROPOSED — NOT in src/main/resources/db/migration on purpose. Review, then move it 
there.
     2	--
     3	-- Step 1 of 2 (additive, backward compatible): a clarification round becomes tied to the 
opener's own
     4	-- approval piece (one piece = one project + one lead). Nothing existing is dropped or 
altered, so the
     5	-- currently deployed backend keeps working: it ignores the new column and never writes it.
     6	--
     7	-- The old per-entry unique index (idx_eod_clarification_open_per_entry) is KEPT here; it 
is replaced in
     8	-- V116 only after the backfill below has been verified.
     9	
    10	ALTER TABLE eod_clarification
    11	    ADD COLUMN piece_id BIGINT NULL REFERENCES eod_project_approval(id);
    12	
    13	CREATE INDEX idx_eod_clarification_piece ON eod_clarification(piece_id);
    14	
    15	-- At most one open round per piece. Legacy rows (piece_id NULL) are not covered by this 
index and keep
    16	-- the old per-entry rule.
    17	CREATE UNIQUE INDEX idx_eod_clarification_open_per_piece
    18	    ON eod_clarification(piece_id) WHERE status <> 'RESOLVED' AND piece_id IS NOT NULL;
    19	
    20	-- Backfill: map a round to the CURRENT-cycle piece its opener holds (as approver or 
escalated-to) on the
    21	-- same entry — but only when that is unambiguous (exactly one such piece). A round whose 
opener holds
    22	-- several current pieces on the entry (a lead of two projects on one EOD), or none (e.g. a 
superseded
    23	-- cycle), keeps piece_id NULL: a "legacy" round that only its opener (and the employee) 
can use, and that
    24	-- blocks only the pending pieces its opener still holds.
    25	WITH candidates AS (
    26	    SELECT c.id AS clarification_id,
    27	           p.id AS piece_id,
    28	           COUNT(*) OVER (PARTITION BY c.id) AS n
    29	    FROM eod_clarification c
    30	    JOIN eod_project_approval p
    31	      ON p.eod_entry_id = c.eod_entry_id
    32	     AND p.superseded_at IS NULL
    33	     AND (p.approver_id = c.opened_by_id OR p.escalated_to_id = c.opened_by_id)
    34	    WHERE c.piece_id IS NULL
    35	)
    36	UPDATE eod_clarification c
    37	SET piece_id = candidates.piece_id
    38	FROM candidates
    39	WHERE candidates.clarification_id = c.id
    40	  AND candidates.n = 1;
```

### V116__eod_clarification_replace_entry_index.sql

```sql
     1	-- PROPOSED — NOT in src/main/resources/db/migration on purpose. Apply ONLY after V115 is 
applied and its
     2	-- backfill report has been reviewed.
     3	--
     4	-- Step 2 of 2: allow one open round per piece (two leads can each have a round open on the 
same EOD).
     5	-- The per-entry rule is kept only for legacy rows that have no piece.
     6	--
     7	-- Compatibility note: after this runs, a database can hold two open rounds on one entry. 
The OLD backend's
     8	-- findByEodEntryIdAndStatusNot (an Optional) would throw on such an entry. ORDER: V115, 
then deploy the
     9	-- new backend everywhere that uses this database, THEN this file. Flyway runs it as one 
transaction.
    10	
    11	DROP INDEX idx_eod_clarification_open_per_entry;
    12	
    13	CREATE UNIQUE INDEX idx_eod_clarification_open_legacy_per_entry
    14	    ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED' AND piece_id IS NULL;
```

### V115_round31_branch_only.sql

```sql
     1	-- NEON BRANCH ONLY. NOT part of V115 and never to be run on the shared database.
     2	-- Attach legacy round 31 (entry 2357) to ONEHR piece 2608 by hand, and do NOT resolve it.
     3	
     4	-- BEFORE: expect piece_id NULL, status NEEDS_RESPONSE.
     5	SELECT c.id, c.eod_entry_id, c.status, c.opened_by_id, c.piece_id, p.project_id
     6	FROM eod_clarification c
     7	LEFT JOIN eod_project_approval p ON p.id = c.piece_id
     8	WHERE c.id = 31;
     9	
    10	-- UPDATE: exactly one row expected. Only matches while the round is unmapped and piece 
2608 belongs to
    11	-- the same entry.
    12	UPDATE eod_clarification c
    13	SET piece_id = p.id
    14	FROM eod_project_approval p
    15	WHERE c.id = 31
    16	  AND c.piece_id IS NULL
    17	  AND p.id = 2608
    18	  AND p.eod_entry_id = c.eod_entry_id;
    19	
    20	-- AFTER: expect piece_id = 2608, project_id = the ONEHR project, status still 
NEEDS_RESPONSE.
    21	SELECT c.id, c.eod_entry_id, c.status, c.opened_by_id, c.piece_id, p.project_id
    22	FROM eod_clarification c
    23	LEFT JOIN eod_project_approval p ON p.id = c.piece_id
    24	WHERE c.id = 31;
```
