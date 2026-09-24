import type { CSSProperties } from 'react';

// Z-index placement: above the sidebar (40), mobile drawer (45/50) and topbar popovers (100),
// below Modal (900/901), DropdownMenu (1000) and toasts (9999) — see Shell.tsx's z-index ladder.
export const LAUNCHER_Z = 800;
export const PANEL_Z = 850;

export const PANEL_WIDTH = 400;
export const PANEL_HEIGHT = 600;

export const launcherButtonStyle: CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 24,
  zIndex: LAUNCHER_Z,
  width: 56,
  height: 56,
  borderRadius: '50%',
  border: '1px solid var(--line)',
  background: 'var(--brand)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
};

export const panelContainerStyle: CSSProperties = {
  position: 'fixed',
  right: 24,
  bottom: 92,
  zIndex: PANEL_Z,
  width: PANEL_WIDTH,
  maxWidth: 'calc(100vw - 32px)',
  height: PANEL_HEIGHT,
  maxHeight: 'calc(100vh - 120px)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
  overflow: 'hidden',
};

export const headerStyle: CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--raised)',
};

export const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

export const composerStyle: CSSProperties = {
  flexShrink: 0,
  borderTop: '1px solid var(--line)',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: 'var(--raised)',
};

export const iconButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--txt-mut)',
  cursor: 'pointer',
};

export const bubbleBaseStyle: CSSProperties = {
  maxWidth: '85%',
  padding: '10px 12px',
  borderRadius: 12,
  fontSize: 13.5,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const userBubbleStyle: CSSProperties = {
  ...bubbleBaseStyle,
  alignSelf: 'flex-end',
  background: 'var(--brand)',
  color: '#fff',
  borderBottomRightRadius: 4,
};

export const assistantBubbleStyle: CSSProperties = {
  ...bubbleBaseStyle,
  alignSelf: 'flex-start',
  background: 'var(--raised2)',
  border: '1px solid var(--line)',
  color: 'var(--txt)',
  borderBottomLeftRadius: 4,
};
