import { useState } from 'react';
import { Calendar, ChevronDown, RefreshCw, X } from 'lucide-react';
import type { DateRange } from '../api/teamLead';
import { todayISO as localTodayISO, toLocalISODate } from '../lib/date';

// ── Shared Blockers-style date/calendar filter ───────────────────────────────────
// Extracted from the three Blockers pages (pages/lead/Blockers.tsx, pages/pm/Blockers.tsx,
// pages/employee/MyBlockers.tsx), which had each grown their own near-identical copy of this
// Today/Yesterday/Custom-range popover. Now the one implementation all three (and EOD Inbox,
// which reuses it for the same filtering need) point at, so a future tweak lands everywhere at
// once instead of needing three (or six) separate edits.
//
// The three original copies differed slightly, preserved here as opt-in props rather than
// silently dropped or forced to converge:
// - Employee's had a 4th "All time" quick option (`showAllOption`).
// - Team Lead/PM's disabled the trigger and swapped its icon for a spinner while the previous
//   selection's data was still loading (`loading`), and validated the date order/future-ness
//   fully in JS with no native min/max, showing an inline error message instead of the browser's
//   own validation bubble (`enforceNotFuture`). Employee's relied on the native `max` attribute
//   alone with no inline future-date message.
// - PM's additionally showed a small "X" next to the trigger itself to clear a custom range
//   back to Today without opening the popover (`showClearRangeButton`).

export type DateFilterMode = 'all' | 'today' | 'yesterday' | 'range';

export function yesterdayISODate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

export function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DateFilterButton({
  mode, range, onChange, loading = false, showAllOption = false, showClearRangeButton = false, enforceNotFuture = true,
}: {
  mode: DateFilterMode;
  range: DateRange;
  onChange: (mode: DateFilterMode, range: DateRange) => void;
  /** Disables the trigger and swaps its icon for a spinner while the previous selection's data
   *  is still loading — there's nowhere else to reopen the picker from, so this is what stops a
   *  second, overlapping request from firing before the first settles. */
  loading?: boolean;
  /** Adds a 4th quick-select button ("All time") alongside Today/Yesterday, resolving to an
   *  empty range (no filter at all) — the Employee Blockers page's own addition. */
  showAllOption?: boolean;
  /** A small "X" beside the trigger itself, shown only in 'range' mode, that clears straight
   *  back to Today without opening the popover — the PM Blockers page's own addition. */
  showClearRangeButton?: boolean;
  /** Team Lead/PM's stricter behavior: validates order AND future-ness fully in JS (native
   *  min/max deliberately omitted so only one validation message ever shows), with its own
   *  inline error text. false relies on the native `max` attribute alone (Employee's original
   *  behavior), with no separate future-date message. */
  enforceNotFuture?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const todayISO = localTodayISO();
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  const orderInvalid = draftFrom !== '' && draftTo !== '' && draftFrom > draftTo;
  const futureInvalid = enforceNotFuture && ((draftFrom !== '' && draftFrom > todayISO) || (draftTo !== '' && draftTo > todayISO));
  const rangeInvalid = orderInvalid || futureInvalid;

  const label = mode === 'all' ? 'All time'
    : mode === 'today' ? `Today, ${fmtShortDate(todayISO)}`
    : mode === 'yesterday' ? `Yesterday, ${fmtShortDate(range.from)}`
    : range.from === range.to ? fmtShortDate(range.from) : `${fmtShortDate(range.from)} – ${fmtShortDate(range.to)}`;

  function openPicker() {
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setOpen(o => !o);
  }

  function applyDraft() {
    if (rangeInvalid) return;
    // Either side can be cleared independently (see the From/To "X" buttons below) — an empty
    // side falls back to the other so a single-ended selection still resolves to a real range;
    // clearing both reverts to the Today default (or All time, if that option is offered).
    if (draftFrom === '' && draftTo === '') {
      if (showAllOption) onChange('all', { from: '', to: '' });
      else onChange('today', { from: todayISO, to: todayISO });
      setOpen(false);
      return;
    }
    const from = draftFrom || draftTo;
    const to = draftTo || draftFrom;
    onChange('range', { from, to });
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        disabled={loading}
        onClick={openPicker}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', background: 'var(--raised)',
          border: '1px solid var(--line)', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? <RefreshCw size={13} aria-hidden="true" className="nf-r-spin" />
          : <Calendar size={13} aria-hidden="true" />}
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {showClearRangeButton && mode === 'range' && (
        <button
          type="button"
          aria-label="Clear custom range"
          disabled={loading}
          onClick={() => onChange('today', { from: todayISO, to: todayISO })}
          style={{
            background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', padding: 2, opacity: loading ? 0.5 : 1,
          }}
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
      {open && !loading && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 300,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {showAllOption && (
                <button
                  onClick={() => { onChange('all', { from: '', to: '' }); setOpen(false); }}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                    background: mode === 'all' ? 'var(--info)' : 'var(--raised2)',
                    color: mode === 'all' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                  }}
                >
                  All time
                </button>
              )}
              <button
                onClick={() => { onChange('today', { from: todayISO, to: todayISO }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'today' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >
                Today
              </button>
              <button
                onClick={() => { const y = yesterdayISODate(); onChange('yesterday', { from: y, to: y }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'yesterday' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >
                Yesterday
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Custom range
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>From</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date" value={draftFrom} max={enforceNotFuture ? undefined : todayISO}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    onInvalid={(e) => e.preventDefault()}
                    style={{
                      width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                      background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      boxSizing: 'border-box', paddingRight: 44,
                    }}
                  />
                  {draftFrom && (
                    <button
                      type="button"
                      aria-label="Clear from date"
                      onClick={() => setDraftFrom('')}
                      style={{
                        position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer',
                        display: 'flex', padding: 4, borderRadius: 4,
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>To</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date" value={draftTo} max={enforceNotFuture ? undefined : todayISO}
                    onChange={(e) => setDraftTo(e.target.value)}
                    onInvalid={(e) => e.preventDefault()}
                    style={{
                      width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                      background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      boxSizing: 'border-box', paddingRight: 44,
                    }}
                  />
                  {draftTo && (
                    <button
                      type="button"
                      aria-label="Clear to date"
                      onClick={() => setDraftTo('')}
                      style={{
                        position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer',
                        display: 'flex', padding: 4, borderRadius: 4,
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {orderInvalid && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                From date cannot be later than To date.
              </div>
            )}
            {!orderInvalid && futureInvalid && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                Date cannot be later than today.
              </div>
            )}
            <button
              onClick={applyDraft}
              disabled={rangeInvalid}
              style={{
                width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: rangeInvalid ? 'not-allowed' : 'pointer', opacity: rangeInvalid ? 0.6 : 1,
              }}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}
