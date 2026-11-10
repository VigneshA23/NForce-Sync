import { LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getNavItem, navPathFor } from '../lib/nav';

/**
 * The page-title card every top-level page opens with — mirrors NForce OneHR's `nf-pd-header`:
 * a panel card with a crimson-tinted icon tile, title + subtitle (+ optional meta line), actions
 * on the right, and faint crimson waves in the bottom-right corner.
 *
 * `icon` defaults to the current route's sidebar icon (via the same NAV lookup the Shell
 * breadcrumb uses), so the header and the sidebar entry can never disagree. Pass one explicitly
 * for pages that aren't in the nav (detail routes, settings pages).
 */
/** The signed-in user, or undefined when rendered outside an AuthProvider. useAuth reads its context
 *  before it throws, so the hook order is the same either way. */
function useSignedInUser() {
  try {
    return useAuth().user;
  } catch {
    return undefined;
  }
}

export function PageHeader({ title, subtitle, meta, icon, actions, style }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small dim line under the subtitle, e.g. "64 of 64 people". */
  meta?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  // Optional on purpose: the header is presentational, and pages are also rendered on their own (unit
  // tests) without the auth/router providers. Pages remount on navigation, so reading the path
  // directly stays in step with the route.
  const user = useSignedInUser();
  const pathname = window.location.pathname;
  const navIcon = user ? getNavItem(user.role, navPathFor(pathname), user.capabilities)?.item.icon : undefined;
  const Icon = icon ?? navIcon ?? LayoutDashboard;

  return (
    <div
      className="nf-page-header"
      style={{
        position: 'relative',
        // No overflow:hidden here — it would clip the dropdown panels of header actions (date-range
        // pickers, filter menus). The decorative waves are clipped by their own wrapper below.
        // z-index lifts the header (and any open popover in it) above the tabs/toolbar that follow.
        zIndex: 5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '22px 24px',
        marginBottom: 20,
        background: 'linear-gradient(100deg, var(--panel) 45%, color-mix(in srgb, var(--brand) 5%, var(--panel)) 100%)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,.25)',
        ...style,
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}>
        <svg
          className="nf-page-header-art"
          viewBox="0 0 420 100"
          preserveAspectRatio="xMaxYMax slice"
          style={{ position: 'absolute', right: 0, bottom: 0, width: 420, height: '100%', color: 'var(--brand)' }}
        >
          <path d="M150 100 C 230 70, 270 20, 420 8 L420 100 Z" fill="currentColor" opacity=".05" />
          <path d="M230 100 C 290 78, 330 40, 420 30 L420 100 Z" fill="currentColor" opacity=".07" />
          <path d="M300 100 C 340 86, 372 62, 420 56 L420 100 Z" fill="currentColor" opacity=".10" />
        </svg>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <div
          className="nf-page-header-icon"
          aria-hidden="true"
          style={{
            width: 52, height: 52, flexShrink: 0, borderRadius: 14,
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-bright)',
            background: 'color-mix(in srgb, var(--brand) 9%, transparent)',
            border: '1px solid color-mix(in srgb, var(--brand) 16%, transparent)',
          }}
        >
          <Icon size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1
            className="nf-page-header-title"
            style={{
              fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
              fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em',
              color: 'var(--txt)', margin: '0 0 4px',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
          )}
          {meta && (
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt-dim)', marginTop: 6 }}>{meta}</div>
          )}
        </div>
      </div>

      {actions && (
        <div className="nf-page-header-actions" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
