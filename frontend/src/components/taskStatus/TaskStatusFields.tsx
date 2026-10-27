import type { CSSProperties, ReactNode } from 'react';
import { MAX_BLOCKER_REASON, TASK_STATUSES, TASK_STATUS_COLOR, taskStatusLabel } from './taskStatus';

/**
 * The Status dropdown and the Blocker reason box, as Submit EOD draws them for a task — shared so the Daily Log's
 * line cards show exactly the same controls, labels and styling. Self-contained (own label / control styles, the
 * same tokens both forms use); a host that needs a taller control passes `controlStyle`.
 */

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.06em',
  textTransform: 'uppercase', marginBottom: 5,
};

const controlBase: CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'var(--raised2)', border: '1px solid var(--line2)',
  borderRadius: 6, color: 'var(--txt)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

function Label({ children }: { children: ReactNode }) {
  return <div style={labelStyle}>{children}</div>;
}

function Req() {
  return <span style={{ color: '#E4373D' }}>*</span>;
}

/** Status * — a select over the four values, or the chosen label when the entry is read-only. */
export function TaskStatusField({ value, onChange, readOnly = false, disabled = false, id, controlStyle, error }: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  /** Greys the control out (a Submit EOD leave row is forced to Completed). */
  disabled?: boolean;
  id?: string;
  controlStyle?: CSSProperties;
  /** An inline problem to show beneath the control. */
  error?: string | null;
}) {
  return (
    <div>
      <Label>Status <Req /></Label>
      {readOnly ? (
        <div style={{ ...controlBase, fontSize: 12, color: TASK_STATUS_COLOR[value] ?? 'var(--txt)', ...controlStyle }}>
          {/* An unset status must not echo the dropdown's own placeholder back as a value. */}
          {taskStatusLabel(value) ?? '-'}
        </div>
      ) : (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          style={{
            ...controlBase,
            ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null),
            ...(error ? { borderColor: 'rgba(228,55,61,.6)' } : null),
            ...controlStyle,
          }}
        >
          {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )}
      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--risk)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

/** Blocker reason * — shown only while the status is Blocked; read-only text once the entry is locked. */
export function BlockerReasonField({ value, onChange, readOnly = false, id, error }: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  id?: string;
  error?: string | null;
}) {
  const used = value.length;
  return (
    <div style={{ marginTop: 10 }}>
      <Label>
        <span style={{ color: '#E4373D' }}>Blocker reason</span>
        <span style={{ color: '#E4373D', marginLeft: 3 }}>*</span>
      </Label>
      {readOnly
        ? <div style={{ ...controlBase, opacity: 0.7, lineHeight: 1.5, borderColor: 'rgba(228,55,61,.3)' }}>{value || '-'}</div>
        : <>
            <textarea
              id={id}
              value={value}
              onChange={e => onChange(e.target.value)}
              rows={2}
              placeholder="Describe what is blocking you and what support you need"
              maxLength={MAX_BLOCKER_REASON}
              aria-required="true"
              aria-invalid={error ? true : undefined}
              style={{
                ...controlBase, resize: 'vertical', minHeight: 54, lineHeight: 1.5,
                borderColor: error ? 'rgba(228,55,61,.6)' : 'rgba(228,55,61,.35)',
              }}
            />
            <div aria-live="polite" style={{ fontSize: 11, color: used >= MAX_BLOCKER_REASON ? 'var(--warn)' : 'var(--txt-dim)', textAlign: 'right', marginTop: 4 }}>
              {used}/{MAX_BLOCKER_REASON} characters used
            </div>
          </>}
      {error && <div role="alert" style={{ fontSize: 11, color: 'var(--risk)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
