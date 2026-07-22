import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X, Search, Bell, LogOut, Sun, Moon } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { NAV, ROLE_COLORS, ROLE_LABELS, getNavPaths } from '../lib/nav';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { NotAuthorized } from '../pages/NotAuthorized';

// ─── Sidebar content (shared desktop + mobile) ────────────────────────────────
// All colors hardcoded dark — sidebar NEVER themes regardless of html data-theme.

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = user!.role;
  const navSections = NAV[role];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Brand header */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '1px solid #2A2E37',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <BrandMark size="sm" />
        <div>
          <div style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.04em',
            color: '#E8EAED',
          }}>
            N-FORCE SYNC
          </div>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#6B7280',
            marginTop: 2,
          }}>
            EOD & Utilization
          </div>
        </div>
      </div>

      {/* Scrollable nav sections */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 8px' }}>
        {navSections.map((section) => (
          <div key={section.section}>
            <div style={{
              padding: '12px 10px 5px',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#6B7280',
              fontWeight: 500,
            }}>
              {section.section}
            </div>

            {section.items.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  className="nf-sidebar-item"
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '9px 11px',
                    margin: '1px 8px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    position: 'relative',
                    fontSize: 13,
                    fontWeight: 450,
                  }}
                  onClick={onNavClick}
                >
                  {/* Active left rail */}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: -8,
                        top: 6,
                        bottom: 6,
                        width: 3,
                        background: '#E4373D',
                        borderRadius: '0 3px 3px 0',
                      }}
                    />
                  )}

                  <Icon size={17} style={{ flex: 'none', opacity: isActive ? 1 : 0.8 }} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>

                  {/* Notification badge */}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      aria-label={`${item.badge} unread`}
                      style={{
                        background: '#B11116',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1,
                        padding: '2px 5px',
                        borderRadius: 10,
                        fontFamily: '"JetBrains Mono", monospace',
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}

                  {/* Phase badge */}
                  {item.phase !== undefined && (
                    <span
                      title={`Ships in phase ${item.phase}`}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: '#6B7280',
                        background: '#262A32',
                        padding: '2px 5px',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      P{item.phase}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer: user identity + full-width sign-out */}
      <div style={{ borderTop: '1px solid #2A2E37', padding: '6px 8px 8px', flexShrink: 0 }}>
        {/* User identity — non-interactive */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 8px' }}>
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: ROLE_COLORS[role],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              flexShrink: 0,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {user!.initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#E8EAED',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {user!.name}
            </div>
            <div style={{
              fontSize: 10,
              color: '#6B7280',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {ROLE_LABELS[role]}
            </div>
          </div>
        </div>

        {/* Sign out — full-width, icon + text, obvious hover state */}
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="nf-sidebar-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '9px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            color: '#9BA1AC',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(228,55,61,.08)';
            e.currentTarget.style.color = '#E4373D';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#9BA1AC';
          }}
        >
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const reduced = useReducedMotion();

  const role = user!.role;
  const allowedPaths = getNavPaths(role);
  const isAllowed = allowedPaths.includes(location.pathname) || location.pathname === '/';

  const bellBadge = NAV[role]
    .flatMap(s => s.items)
    .find(i => i.key === 'notifications')?.badge ?? 0;

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>

      {/* ── Desktop sidebar — always dark ───────────────── */}
      <aside
        className="shell-sidebar"
        aria-label="Main navigation"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 236,
          background: '#0E0F12',
          borderRight: '1px solid #2A2E37',
          zIndex: 40,
          overflow: 'hidden',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer — always dark ─────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.62)',
                backdropFilter: 'blur(2px)',
                zIndex: 45,
              }}
            />
            <motion.aside
              initial={{ x: -236 }}
              animate={{ x: 0 }}
              exit={{ x: -236 }}
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 34 }}
              aria-label="Main navigation"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 236,
                background: '#0E0F12',
                borderRight: '1px solid #2A2E37',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#1E2128',
                  border: '1px solid #2A2E37',
                  cursor: 'pointer',
                  color: '#9BA1AC',
                  padding: 5,
                  borderRadius: 5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
              <SidebarContent onNavClick={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main area ───────────────────────────────────── */}
      <div
        className="shell-main-content"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100dvh',
          minWidth: 0,
        }}
      >
        {/* Topbar — always dark frame */}
        <header
          style={{
            height: 60,
            background: 'rgba(14,15,18,.96)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid #2A2E37',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="shell-hamburger"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#9BA1AC',
              padding: '6px',
              borderRadius: 5,
              flexShrink: 0,
            }}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          {/* Spacer — pushes right controls to the right */}
          <div style={{ flex: 1 }} />

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              aria-label="Search"
              className="nf-topbar-item"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search size={17} aria-hidden="true" />
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="nf-topbar-item"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {theme === 'dark'
                ? <Sun size={17} aria-hidden="true" />
                : <Moon size={17} aria-hidden="true" />}
            </button>

            <Link
              to="/notifications"
              aria-label={bellBadge > 0 ? `Notifications, ${bellBadge} unread` : 'Notifications'}
              className="nf-topbar-item"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              <Bell size={17} aria-hidden="true" />
              {bellBadge > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    minWidth: 16,
                    height: 16,
                    background: '#E4373D',
                    borderRadius: 8,
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontVariantNumeric: 'tabular-nums',
                    border: '1.5px solid #0E0F12',
                  }}
                >
                  {bellBadge}
                </span>
              )}
            </Link>

            <div
              aria-label={`Signed in as ${user!.name}`}
              title={user!.name}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: ROLE_COLORS[role],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                flexShrink: 0,
                marginLeft: 6,
                fontFamily: 'Inter, sans-serif',
                userSelect: 'none',
              }}
            >
              {user!.initials}
            </div>
          </div>
        </header>

        {/* Page content — only this area themes */}
        <main
          style={{
            flex: 1,
            padding: '28px 28px',
            minWidth: 0,
            background: 'var(--shell)',
          }}
        >
          {isAllowed ? <Outlet /> : <NotAuthorized />}
        </main>
      </div>
    </div>
  );
}
