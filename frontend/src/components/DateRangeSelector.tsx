import { useState } from 'react';
import { Calendar, ChevronDown, Loader2 } from 'lucide-react';

// ── Shared "date range" toolbar control ──────────────────────────────────────
// Extracted from pages/lead/TeamDashboard.tsx's date filter (Today / Yesterday quick-select +
// custom From/To range) so the Approvals page can offer Team Leads the exact same way of
// browsing by date instead of a second, divergent implementation. Open/draft state is owned
// entirely by this component — the caller only needs to know the currently COMMITTED
// mode/range and how to commit a new one (via URL params, local state, wherever it lives on
// that page); this component never reads or writes storage/URL itself.

export type QuickRangeMode = 'today' | 'yesterday' | 'range';

export function DateRangeSelector({
  mode, range, todayISO, label, onSelectQuick, onApplyRange, isRefreshing = false,
}: {
  mode: QuickRangeMode;
  range: { from: string; to: string };
  todayISO: string;
  /** Pre-formatted button text (e.g. "Today, 24 Sep" / "12 Sep – 18 Sep") — date formatting
   *  stays page-specific, this component only renders whatever label it's given. */
  label: string;
  onSelectQuick: (kind: 'today' | 'yesterday') => void;
  onApplyRange: (from: string, to: string) => void;
  /** Optional spin indicator in place of the dropdown chevron while a background refetch
   *  triggered by the current range is in flight. */
  isRefreshing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  function openPicker() {
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setOpen(true);
  }

  function selectQuick(kind: 'today' | 'yesterday') {
    onSelectQuick(kind);
    setOpen(false);
  }

  function applyRange() {
    if (draftFrom > draftTo) return;
    onApplyRange(draftFrom, draftTo);
    setOpen(false);
  }

  const rangeInvalid = draftFrom > draftTo;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
          color: 'var(--txt)', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={13} aria-hidden="true" />
        {label}
        {isRefreshing
          ? <Loader2 size={12} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
          : <ChevronDown size={12} aria-hidden="true" />}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 260,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => selectQuick('today')}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'today' ? '#fff' : 'var(--txt)',
                  border: '1px solid var(--line2)',
                }}
              >
                Today
              </button>
              <button
                onClick={() => selectQuick('yesterday')}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'yesterday' ? '#fff' : 'var(--txt)',
                  border: '1px solid var(--line2)',
                }}
              >
                Yesterday
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Custom range
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>From</div>
                <input
                  type="date" value={draftFrom} max={todayISO}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  style={{ width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>To</div>
                <input
                  type="date" value={draftTo} max={todayISO}
                  onChange={(e) => setDraftTo(e.target.value)}
                  style={{ width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            {rangeInvalid && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                From date cannot be later than To date.
              </div>
            )}
            <button
              onClick={applyRange}
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
