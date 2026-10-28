import { AlertTriangle } from 'lucide-react';

// Shared by the Business Rules page and its Shift / Holiday modals (moved here verbatim from BusinessRules.tsx).

// Error text is --risk nudged toward the body text colour. Plain --risk is 4.15:1 on the Dark panel (3.84:1 on the banner
// tint), under the 4.5:1 small text needs; at 80% it is 4.68:1 or better in Dark, Light and both high-contrast themes.
const ERROR_TEXT = 'color-mix(in srgb, var(--risk) 80%, var(--txt))';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 7, marginBottom: 14,
      background: 'rgba(228,55,61,.10)', border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12, color: ERROR_TEXT,
    }} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      {message}
    </div>
  );
}

/** Inline error under a field. Give it an `id` and point the field's aria-describedby at it. */
export function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  return <p id={id} role="alert" style={{ fontSize: 11, color: ERROR_TEXT, margin: '5px 0 0' }}>{msg}</p>;
}

// Small non-editable suffix (e.g. "min", "hrs") inside a numeric input, so the
// unit is visible without re-reading the field label above.
export function UnitField({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <span style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        fontSize: 11, fontWeight: 500, color: 'var(--txt-dim)', pointerEvents: 'none',
      }}>
        {unit}
      </span>
    </div>
  );
}
