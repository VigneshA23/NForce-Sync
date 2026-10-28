import type { ReactNode } from 'react';
import { formatTime12h } from '../../lib/date';
import {
  ADJ_TYPES, minutesLabel,
} from './timeAdjustment';
import type { TimeAdjustmentState } from './useTimeAdjustment';

/**
 * The time-adjustment UI shared by Submit EOD and the Daily Log: the checkbox, the Shift Timings panel, the three
 * type radios, the duration dropdown, the calculated-impact banner and "View available balance" — plus the
 * read-only recap shown once the entry is no longer editable. All state comes from useTimeAdjustment.
 *
 * `recapNote` is the host's sentence for how the adjustment counts toward that form's hours (Submit EOD and the
 * Daily Log word it differently); `dailyHoursCap` feeds the "N working hours" line under the shift.
 */
export function TimeAdjustmentSection({ ta, dailyHoursCap, isEditable, isReadOnly, recapNote }: {
  ta: TimeAdjustmentState;
  dailyHoursCap: number;
  isEditable: boolean;
  isReadOnly: boolean;
  recapNote?: ReactNode;
}) {
  const {
    adjEnabled, adjType, adjMinutes, adjMins, adjContext, adjBudget, adjUsedMins, adjRemaining, adjExhausted,
    shiftMins, canRequestAdj, showBalance, durationOptions, unchangedFromSaved,
  } = ta;
  const breakMins = Math.max(0, shiftMins - dailyHoursCap * 60);

  return (
    <>
      {/* Read-only recap of an adjustment already on the entry. The editable block below is gated on
          isEditable, so without this a submitted/approved day showed no trace of the adjustment. */}
      {isReadOnly && adjType && adjMins > 0 && (
        <div style={{
          marginTop: 20, padding: '14px 18px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--brand-bright) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-bright) 30%, transparent)',
        }}>
          <Label>Time adjustment</Label>
          <div style={{ fontSize: 13, color: 'var(--txt)', marginTop: 2 }}>
            {ADJ_TYPES.find(t => t.value === adjType)?.label ?? 'Time adjustment'}
            {' · '}
            <span>{minutesLabel(adjMins)}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 6 }}>
            {ta.banner()}
          </div>
          {recapNote && (
            <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 4 }}>{recapNote}</div>
          )}
        </div>
      )}

      {/* Time adjustment — a partial-day schedule shift on a working day. Hidden entirely for Leave/Holiday,
          and when no shift is assigned (nothing to compute from). */}
      {canRequestAdj && isEditable && (
        <>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={adjEnabled}
              onChange={e => ta.toggle(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
              Request a time adjustment for today (late arrival, early leave, or time away mid-shift)
            </span>
          </label>

          {adjEnabled && (
            <div style={{
              marginTop: 12, padding: '16px 18px', borderRadius: 8,
              background: 'color-mix(in srgb, var(--brand-bright) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-bright) 30%, transparent)',
            }}>
              {/* Shift timings — read-only, from the existing shift assignment */}
              <Label>Shift timings</Label>
              <div style={{ fontSize: 13, color: 'var(--txt)', marginBottom: 4 }}>
                {adjContext?.shiftStart && adjContext?.shiftEnd
                  ? `${formatTime12h(adjContext.shiftStart)} – ${formatTime12h(adjContext.shiftEnd)}`
                  : '-'}
                {adjContext?.shiftName && (
                  <span style={{ color: 'var(--txt-dim)', fontFamily: 'inherit' }}> · {adjContext.shiftName}</span>
                )}
              </div>
              {/* Spells out why expected hours come off the configured cap and not the longer span. */}
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 14 }}>
                {(shiftMins / 60).toFixed(0)}h rostered
                {breakMins > 0 && ` · ${breakMins}m unpaid break`}
                {' '}· {dailyHoursCap} working hours
              </div>

              {/* Mutually exclusive types. The budget is one shared pool, so when it is spent every type is
                  unavailable — not just the one it was spent on. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 14 }}>
                {ADJ_TYPES.map(t => (
                  <label
                    key={t.value}
                    title={adjExhausted ? 'Monthly time adjustment budget fully used' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, fontSize: 13,
                      cursor: adjExhausted ? 'not-allowed' : 'pointer',
                      opacity: adjExhausted ? 0.5 : 1,
                      color: adjType === t.value ? 'var(--txt)' : 'var(--txt-mut)',
                      fontWeight: adjType === t.value ? 600 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="timeAdjType"
                      checked={adjType === t.value}
                      disabled={adjExhausted}
                      onChange={() => ta.changeType(t.value)}
                      style={{ width: 'auto', accentColor: 'var(--brand)', cursor: adjExhausted ? 'not-allowed' : 'pointer' }}
                    />
                    <span>{t.label}</span>
                  </label>
                ))}
                {adjExhausted && (
                  <span style={{ fontSize: 11, color: 'var(--warn)', alignSelf: 'center' }}>
                    Monthly budget fully used ({minutesLabel(adjUsedMins)} of {minutesLabel(adjBudget)})
                  </span>
                )}
              </div>

              {/* Duration — 15-minute steps up to what is left in the pool (and the 2-hour / shift caps), so an
                  unaffordable option cannot be picked at all. Server re-validates. */}
              {adjType && (
                <div style={{ maxWidth: 240, marginBottom: 14 }}>
                  <Label>{ADJ_TYPES.find(t => t.value === adjType)?.durationLabel}</Label>
                  <select
                    value={adjMinutes}
                    onChange={e => ta.changeMinutes(e.target.value)}
                    disabled={durationOptions.length === 0 && !unchangedFromSaved}
                    style={selectStyle}
                  >
                    <option value="">Select Time</option>
                    {/* An off-step legacy value already saved on this entry stays selectable so editing is not blocked. */}
                    {unchangedFromSaved && !durationOptions.includes(adjMins) && (
                      <option value={adjMins}>{minutesLabel(adjMins)}</option>
                    )}
                    {durationOptions.map(m => (
                      <option key={m} value={m}>{minutesLabel(m)}</option>
                    ))}
                  </select>
                  {adjExhausted && (
                    <div role="status" style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6 }}>
                      No time adjustment balance left this month ({minutesLabel(adjUsedMins)} of {minutesLabel(adjBudget)} used).
                    </div>
                  )}
                </div>
              )}

              {/* Live calculated impact */}
              <div style={{
                padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                background: 'color-mix(in srgb, var(--brand-bright) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand-bright) 30%, transparent)',
                color: 'var(--brand-bright)',
              }}>
                {ta.banner()}
              </div>

              {/* Real usage for the entry's calendar month — not a placeholder */}
              <button
                type="button"
                onClick={() => ta.setShowBalance(s => !s)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 12, color: 'var(--brand-bright)', borderBottom: '1px dashed var(--line2)',
                }}
              >
                View available balance
              </button>
              {showBalance && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 6, fontSize: 12,
                  background: 'var(--raised2)', border: '1px solid var(--line2)',
                  color: 'var(--txt-mut)', display: 'flex', flexWrap: 'wrap', gap: 16,
                }}>
                  <span>
                    Used this month:{' '}
                    <strong style={{ color: 'var(--txt)' }}>
                      {minutesLabel(adjUsedMins)} of {minutesLabel(adjBudget)}
                    </strong>
                  </span>
                  <span>
                    Remaining:{' '}
                    <strong style={{ color: adjExhausted ? 'var(--warn)' : 'var(--ok)' }}>
                      {minutesLabel(adjRemaining)}
                    </strong>
                  </span>
                  {/* Says out loud that the pool is shared — three separate budgets would be misleading. */}
                  <span style={{ flexBasis: '100%', color: 'var(--txt-dim)' }}>
                    Shared across late arrival, intervening time-off and leaving early.
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', minHeight: 38,
  background: 'var(--raised2)', border: '1px solid var(--line2)',
  borderRadius: 6, color: 'var(--txt)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};
