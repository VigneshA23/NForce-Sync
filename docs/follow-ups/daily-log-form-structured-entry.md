# Daily Log form shows "No time breakdown logged" for a structured entry

**Status:** proposed follow-up, not started. Found while fixing the legacy plain-log view; deliberately left alone
there (the form-selection behaviour was out of scope).

## What happens

The Daily Log form is chosen by the user's **current** `eodForm` capability (`App.tsx` `EodSubmitRoute`), not by the
entry's own `entryForm`. The capability is computed from today's situation (`AuthController.computeEodForm`: a
non-EMPLOYEE role with a manager gets `PROJECT_GROUPED` while allocated to a project today, otherwise `PLAIN_LOG`),
so it can change over time.

If a user whose capability is now `PLAIN_LOG` opens an older **structured** (`PROJECT_GROUPED`) entry:

- `DailyLogForm` hydration (`DailyLogForm.tsx` ~lines 227-231) only loads `logLines` inside
  `if (entry.entryForm === 'PLAIN_LOG')`. A structured entry carries `tasks`, not `logLines`, so `lines` stays `[]`
  and `isLeave` stays false.
- When the entry is locked (Pending / Approved) the empty state `lines.length === 0 && !isLeave && isReadOnly`
  renders "No time breakdown logged for this day", although the entry has tasks. The tasks are never shown.
- Confirmed: `logLines` do not hydrate for a structured entry, so this empty message **can** appear for one.

The mirror case exists too: a user now on `PROJECT_GROUPED` opening an old plain-log entry lands in `SubmitEOD`,
which never reads `entryForm` and so shows an empty task row (the legacy summary/hours case is handled in the
Daily Log form only).

## Options (decide before building)

1. **Route by the entry's form, not the user's capability**, for an existing entry: `/eod/submit?date=` loads the
   entry first and renders the form that matches `entry.entryForm`; only a date with no entry uses the capability.
   This also fixes the mirror case. Needs care: editing/saving an old entry of the other form, and the
   "one entry per day" rule when the form type changed.
2. **Read-only fallback inside each form**: a locked entry of the other type renders through the shared read-only
   view (`EodReportView` already renders both `PROJECT_GROUPED` and `PLAIN_LOG`), so nothing is hidden.
   Smaller change; editable entries of the other type still need a decision (convert vs. block).
3. **Suppress the empty message** when the entry has tasks. Cosmetic only: the tasks stay hidden.

## Acceptance
- A user whose capability changed can open any of their past entries and sees all of its content, read-only when
  locked.
- Missing-day rows still open an empty, submittable form under the current capability.
- No change to submission rules, the per-record existence lock, or approved/locked behaviour.
