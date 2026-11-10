/**
 * Shared control styles — buttons, form fields, status pills, tabs and filter chips — mirroring
 * NForce OneHR (its `nf-pd-export`, `nf-pd-input`/`nf-pd-select`, `nf-pd-status`, `nf-tab` and
 * `nf-chip` rules) so every page in Sync reads the same.
 *
 * Inline styles can't express :hover/:focus/:disabled, so each style here has a matching class in
 * index.css that supplies those states — always pass both:
 *
 *   <button className="nf-btn nf-btn--primary" style={btnPrimary}>Save</button>
 *   <select className="nf-field" style={selectStyle}>…</select>
 *
 * Spread and override per use (`{ ...btnPrimary, width: '100%' }`) rather than forking a copy.
 */

const FONT = 'inherit';

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minHeight: 36,
  padding: '8px 18px',
  borderRadius: 8,
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

/** Solid crimson — the one main action on a page or dialog. className="nf-btn nf-btn--primary" */
export const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--brand)',
  border: '1px solid var(--brand)',
  color: '#fff',
};

/** Crimson outline — secondary actions next to a primary (Export, Add filter, View all).
 *  className="nf-btn nf-btn--secondary" */
export const btnSecondary: React.CSSProperties = {
  ...btnBase,
  padding: '7.5px 17.5px', // 1.5px border keeps the same outer size as btnPrimary
  background: 'var(--panel)',
  border: '1.5px solid color-mix(in srgb, var(--brand) 70%, transparent)',
  color: 'var(--brand-bright)',
};

/** Quiet grey — Cancel, Close, Back, Reset. className="nf-btn nf-btn--neutral" */
export const btnNeutral: React.CSSProperties = {
  ...btnBase,
  background: 'var(--raised)',
  border: '1px solid var(--line2)',
  color: 'var(--txt-mut)',
};

/** Destructive confirm — Delete, Deactivate, Reject. className="nf-btn nf-btn--danger" */
export const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: 'color-mix(in srgb, var(--risk) 14%, var(--panel))',
  border: '1px solid color-mix(in srgb, var(--risk) 45%, transparent)',
  color: 'var(--risk)',
};

/** Positive confirm where green carries meaning — Approve, Activate, Reactivate.
 *  className="nf-btn nf-btn--success" */
export const btnSuccess: React.CSSProperties = {
  ...btnBase,
  background: 'var(--ok)',
  border: '1px solid var(--ok)',
  color: '#fff',
};

/** Caution action — Request clarification, Escalate. className="nf-btn nf-btn--warn" */
export const btnWarn: React.CSSProperties = {
  ...btnBase,
  background: 'color-mix(in srgb, var(--warn) 14%, var(--panel))',
  border: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)',
  color: 'var(--warn)',
};

/** Compact variant for buttons inside table rows, cards and toolbars — spread after a variant:
 *  `{ ...btnSecondary, ...btnSm }`. */
export const btnSm: React.CSSProperties = {
  minHeight: 30,
  padding: '5px 12px',
  fontSize: 12,
  borderRadius: 7,
  gap: 5,
};

/** Single-line text/number/date input. className="nf-field" */
export const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  padding: '0 14px',
  background: 'var(--panel)',
  border: '1px solid var(--line2)',
  borderRadius: 9,
  color: 'var(--txt)',
  fontFamily: FONT,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

/** Multi-line input — same frame as fieldStyle, natural height. className="nf-field" */
export const textareaStyle: React.CSSProperties = {
  ...fieldStyle,
  height: 'auto',
  minHeight: 84,
  padding: '10px 14px',
  lineHeight: 1.5,
  resize: 'vertical',
};

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238A909A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/** Native <select> with OneHR's chevron. Uses longhand background properties so callers can
 *  still override `backgroundColor` without losing the arrow. className="nf-field" */
export const selectStyle: React.CSSProperties = {
  ...fieldStyle,
  background: undefined,
  backgroundColor: 'var(--panel)',
  backgroundImage: CHEVRON,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '16px 16px',
  paddingRight: 38,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
  textOverflow: 'ellipsis',
};

/** Form label above a field. */
export const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--txt-mut)',
};

/** Status pill — OneHR's `nf-pd-status`: text in the status colour on a 13% tint of it. Keep the
 *  page's own status→colour mapping; this only owns the shape. */
export function statusPillStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 11px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
    color,
    background: `color-mix(in srgb, ${color} 13%, transparent)`,
  };
}

/** One item of a short list inside a dashboard/summary card — OneHR's `nf-ah-row`: its own
 *  rounded row tinted with the item's colour, instead of a plain divider line. Lay the content out
 *  as [big coloured number or icon] [title + muted sub-line] [optional action on the right].
 *  Stack rows with `display: flex; flexDirection: column; gap: 8`. Pass a neutral colour
 *  (var(--txt-dim)) for rows without a meaningful status. */
export function insetRowStyle(color: string = 'var(--txt-dim)'): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '9px 12px',
    borderRadius: 12,
    background: `color-mix(in srgb, ${color} 8%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
  };
}

/** Big coloured figure at the left of an insetRowStyle row (e.g. "15" pending documents). */
export function insetRowFigureStyle(color: string): React.CSSProperties {
  return {
    minWidth: 28,
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1,
    color,
    fontVariantNumeric: 'tabular-nums',
  };
}

/** Text link to a fuller view — "View all →", "Full report →" (OneHR uses crimson, not blue). */
export const viewAllLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--brand-bright)',
  textDecoration: 'none',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/** Underline tab bar (OneHR `nf-tabs`) — wrap the tab buttons in a div with this style. */
export const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 4,
  boxShadow: 'inset 0 -1px 0 var(--line)',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
};

/** One tab in a tabBarStyle row. Give it role="tab" + aria-selected. className="nf-tab" */
export function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--brand-bright)' : 'transparent'}`,
    color: active ? 'var(--brand-bright)' : 'var(--txt-mut)',
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}

/** Count bubble inside a tab or chip. */
export function tabCountStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    padding: '0 6px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.45,
    fontVariantNumeric: 'tabular-nums',
    background: active ? 'var(--brand)' : 'var(--raised2)',
    color: active ? '#fff' : 'var(--txt-mut)',
  };
}

/** Toggle chip for quick filters (OneHR `nf-chip`). Give it aria-pressed. className="nf-chip" */
export function chipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 6,
    border: `1px solid ${active ? 'var(--brand-bright)' : 'var(--line2)'}`,
    background: active ? 'color-mix(in srgb, var(--brand) 10%, var(--panel))' : 'var(--raised)',
    color: active ? 'var(--brand-bright)' : 'var(--txt-mut)',
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}
