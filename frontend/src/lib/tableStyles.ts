/**
 * Shared data-table look — mirrors NForce OneHR's `nf-pd-table` (People Directory) so every
 * table in Sync reads the same: bold uppercase 11px header on a faintly tinted head row, 14px
 * cell padding, and a faint crimson row hover. Put `className="nf-table"` on the <table> to get
 * the hover (index.css); spread these into each <th>/<td> and override per column as needed.
 */

export const tableThStyle: React.CSSProperties = {
  padding: '13px 16px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--txt-mut)',
  textAlign: 'left',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'color-mix(in srgb, var(--txt-dim) 7%, var(--panel))',
  borderBottom: '1px solid var(--line)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

export const tableTdStyle: React.CSSProperties = {
  padding: '14px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  lineHeight: 1.4,
  color: 'color-mix(in srgb, var(--txt) 72%, var(--txt-mut))',
};

/** The card a table (and its filter row) sits in — OneHR's `nf-pd-card`. */
export const tableCardStyle: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,.25)',
  overflow: 'hidden',
};
