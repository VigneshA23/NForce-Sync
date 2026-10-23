# V116 readiness note and post-V116 check

## Readiness note

V116 changes one thing in the database: it drops the old unique index `idx_eod_clarification_open_per_entry` (at most one open clarification round per EOD entry) and creates `idx_eod_clarification_open_legacy_per_entry`, a unique index that applies only to legacy rounds with no `piece_id`; the per-piece rule from V115 (`idx_eod_clarification_open_per_piece`) then becomes the only limit for new rounds, so two leads can each have an open round on the same EOD. It runs as one Flyway transaction, so if it fails nothing changes, and it cannot fail on existing data (round 31 is the only open legacy round). An old backend (commit 7996143 or earlier) that meets an entry with two open rounds breaks only on that entry: replying to or changing the status of a round returns a 500 (its single-result lookup `findByEodEntryIdAndStatusNot` finds two rows), opening a new round returns 409, and approve/reject is blocked for every piece of that EOD (its entry-wide check sees an open round); every other entry, the Approvals lists and reading status or threads keep working. Release V116 only when every backend that uses this database runs the new code. Rollback is one transaction with a single DROP INDEX / CREATE INDEX pair that restores the exact V87 index; it works only while no entry has two open rounds, so run the precondition first and resolve one round of any entry it lists:

```sql
-- precondition: must return zero rows
SELECT eod_entry_id, count(*) FROM eod_clarification
WHERE status <> 'RESOLVED' GROUP BY eod_entry_id HAVING count(*) > 1;

-- rollback (one transaction)
BEGIN;
DROP INDEX idx_eod_clarification_open_legacy_per_entry;
CREATE UNIQUE INDEX idx_eod_clarification_open_per_entry
    ON eod_clarification(eod_entry_id) WHERE status <> 'RESOLVED';
COMMIT;
```

Afterwards also remove the Flyway record only if you revert the V116 file from the code (`DELETE FROM flyway_schema_history WHERE version = '116';`); if the file stays in the jar, leave the record, otherwise Flyway would think V116 still needs to run. No data is changed by V116 or by this rollback.

## Check to run as a lead after V116

Use the EOD of Sravani Pilla dated 12-10-2026 (entry 2386): Akash's ARENA round on it is already open, Vignesh's SYNC piece is pending and unblocked. This sends real notifications to Sravani; resolve both rounds at the end.

1. Vignesh: Approvals > Pending > Sravani Pilla 12-10-2026 (SYNC card) > menu > Request Clarification / open chat, send "V116 check". Expected: it succeeds. Before V116 this is refused because the entry already has an open round.
2. Vignesh's chat shows only his message; Akash (ARENA card, same EOD) sees only his own thread, not Vignesh's, and vice versa. Each card shows "Clarification requested" with Approve/Reject disabled on its own card.
3. Sravani: My EOD History shows two buttons, "Clarification requested · SYNC" and "· ARENA"; EOD Inbox lists two rows. She replies to the SYNC one: only Vignesh gets the notification, Akash does not.
4. Akash resolves his round (Yes, Resolve). Expected: his ARENA card gets Approve/Reject back; Vignesh's round stays open and his SYNC card stays blocked; Sravani still sees the SYNC one as open.
5. Cross-thread by id: in the browser DevTools Network tab, copy the thread request ("replies") as fetch, replace `clarificationId` with the other lead's round id, run it. Expected: 403, no data.
6. Cleanup: Vignesh resolves his round.

Read-only confirmation (the assistant can run it): `SELECT id, piece_id, status FROM eod_clarification WHERE eod_entry_id = 2386 ORDER BY id;` should show two rounds with different `piece_id` values (ARENA and SYNC pieces) at the same time.
