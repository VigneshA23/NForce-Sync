// Shared form styles for the Business Rules page and its Shift / Holiday modals (moved here verbatim from
// BusinessRules.tsx; matches the OrganizationMasters.tsx idiom). Kept apart from formParts.tsx, which holds components.

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

/** The red border an invalid field gets. var(--risk) is defined for both themes (Dark #E4373D, Light #C81A1F). */
export const invalidBorder: React.CSSProperties = { border: '1px solid var(--risk)' };   // shorthand, like inputStyle's border

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-mut)',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
};

export const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--brand)',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

export const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid var(--line2)',
  borderRadius: 7,
  color: 'var(--txt-mut)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};
