import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X, Search, Bell, LogOut, Sun, Moon, UserCircle2, HelpCircle, Shield } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { NAV, ROLE_COLORS, ROLE_LABELS, getNavPaths, getNavItem } from '../lib/nav';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { NotAuthorized } from '../pages/NotAuthorized';
import { searchUsers, listLocations } from '../api/admin';
import { toRole } from '../api/auth';
import { fetchUnreadCount } from '../api/notifications';
import { usePendingApprovalsCount } from '../api/approvals';

// ─── Workspace search (top nav) ────────────────────────────────────────────────
// Only wired up for superadmin — the destination (User Management) and the
// backend /users/search endpoint are both superadmin-only today.

function WorkspaceSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  // Debounce ~300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['workspace-search', debounced],
    queryFn: () => searchUsers({ q: debounced }),
    enabled: debounced.length > 0,
  });

  const { data: locations } = useQuery({
    queryKey: ['org', 'locations'],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000,
  });

  function locationName(id: number | null): string | null {
    if (id == null) return null;
    return locations?.find((l) => l.id === id)?.name ?? null;
  }

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleSelect(userId: number) {
    setOpen(false);
    setQuery('');
    navigate(`/admin/users?userId=${userId}`);
  }

  const showDropdown = open && debounced.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        className="shell-search"
        role="search"
        aria-label="Search workspace"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#1E2128',
          border: '1px solid #2A2E37',
          borderRadius: 8,
          padding: '7px 11px',
          color: '#6B7280',
          fontSize: 12,
          minWidth: 188,
        }}
      >
        <Search size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search this workspace..."
          aria-label="Search workspace by name, email, role, or location"
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#C8CCD2',
            fontSize: 12,
            width: '100%',
            fontFamily: 'Inter, sans-serif',
          }}
        />
      </div>

      {showDropdown && (
        <div
          role="listbox"
          aria-label="Search results"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 300,
            background: '#1E2128',
            border: '1px solid #2A2E37',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.44)',
            zIndex: 100,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {isFetching ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#9BA1AC' }}>Searching…</div>
          ) : !results || results.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#9BA1AC' }}>
              No results for &ldquo;{debounced}&rdquo;
            </div>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(u.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #2A2E37',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 13, color: '#E8EAED', fontWeight: 500 }}>{u.fullName}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                  {u.email} · {ROLE_LABELS[toRole(u.role)] ?? u.role}
                  {locationName(u.locationId) ? ` · ${locationName(u.locationId)}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar content (shared desktop + mobile) ────────────────────────────────
// All colors hardcoded dark — sidebar NEVER themes regardless of html data-theme.

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();

  const role = user!.role;
  const navSections = NAV[role];

  // Sidebar Approvals badge — always the full all-time "how many yet to approve" count,
  // deliberately UNSCOPED by any date/range filter selected on the Team Dashboard or applied
  // on the Approvals page. Those two surfaces intentionally scope their own numbers to the
  // selected date/range (see TeamDashboard.tsx / Approvals.tsx); the sidebar is global chrome
  // visible on every route and must keep one stable meaning regardless of what date a Team
  // Lead happens to be looking at elsewhere.
  const pendingApprovalsCount = usePendingApprovalsCount(role === 'lead');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Brand header — plain dark, 56px to match topbar height exactly */}
      <div style={{
        height: 56,
        padding: '0 16px',
        borderBottom: '1px solid #23262D',
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
            Nforce Sync
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
            {/* FIX 7: all sections labeled — matches OneHR's labeled-section pattern */}
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
              const badge = role === 'lead' && item.key === 'approvals' ? pendingApprovalsCount : item.badge;
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

                  {badge !== undefined && badge > 0 && (
                    <span
                      aria-label={`${badge} unread`}
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
                      {badge}
                    </span>
                  )}

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

      {/* Footer: user identity only — FIX 5: sign-out moved to topbar avatar dropdown */}
      <div style={{ borderTop: '1px solid #2A2E37', padding: '10px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#B11116',   /* FIX 4: brand red, not role color */
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
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell() {
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate  = useNavigate();
  const reduced   = useReducedMotion();

  const role         = user!.role;
  const allowedPaths = getNavPaths(role);
  const isAllowed    = allowedPaths.includes(location.pathname)
    || location.pathname === '/'
    || location.pathname === '/change-password';

  // FIX 4: derive breadcrumb label from nav map
  const navInfo  = getNavItem(role, location.pathname);
  const pageLabel = navInfo?.item.label ?? 'Home';

  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const bellBadge = unreadCountData ?? 0;

  // Close drawer + profile on route change
  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  // Escape closes drawer and profile dropdown
  useEffect(() => {
    if (!drawerOpen && !profileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (drawerOpen)   setDrawerOpen(false);
        if (profileOpen)  setProfileOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, profileOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function onMouse(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouse);
    return () => document.removeEventListener('mousedown', onMouse);
  }, [profileOpen]);

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
            height: 56,
            background: 'linear-gradient(90deg, #050506 0%, #6B0C10 40%, #A01418 100%)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(228,55,61,.22)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 12,
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

          {/* FIX 4: Breadcrumb — every page, matching "Sync / <Page Name>" pattern */}
          <nav aria-label="Breadcrumb" className="shell-breadcrumb">
            <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>Sync</span>
            <span style={{ fontSize: 13, color: '#3E4450', margin: '0 5px' }}>/</span>
            <span style={{ fontSize: 13, color: '#C8CCD2', fontWeight: 500 }}>{pageLabel}</span>
          </nav>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

            {/* Search bar — functional for superadmin (User Management search target);
                decorative placeholder for other roles, matching the original spec */}
            {role === 'superadmin' ? (
              <WorkspaceSearch />
            ) : (
              <div
                className="shell-search"
                role="search"
                aria-label="Search workspace"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#1E2128',
                  border: '1px solid #2A2E37',
                  borderRadius: 8,
                  padding: '7px 11px',
                  color: '#6B7280',
                  fontSize: 12,
                  cursor: 'text',
                  userSelect: 'none',
                  minWidth: 188,
                }}
              >
                <Search size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>Search this workspace...</span>
              </div>
            )}

            {/* Theme toggle — current-mode text label */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="nf-topbar-item"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 7,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
              }}
            >
              {theme === 'dark'
                ? <Sun  size={15} aria-hidden="true" />
                : <Moon size={15} aria-hidden="true" />}
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                {theme === 'dark' ? 'Light' : 'Dark'}
              </span>
            </button>

            {/* Bell */}
            <Link
              to="/notifications"
              aria-label={bellBadge > 0 ? `Notifications, ${bellBadge} unread` : 'Notifications'}
              className="nf-topbar-item"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 7,
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

            {/* Avatar — clickable, opens profile + sign-out dropdown */}
            <div ref={profileRef} style={{ position: 'relative', marginLeft: 4 }}>
              {/* 32×32 wrapper: avatar circle + badge are siblings, badge positioned relative to this */}
              <div style={{ position: 'relative', width: 32, height: 32 }}>
                <button
                  onClick={() => setProfileOpen(p => !p)}
                  aria-label={`Account: ${user!.name}`}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#B11116',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    border: '2px solid rgba(255,255,255,0.55)',
                    boxSizing: 'border-box',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {user!.initials}
                </button>

                {/* Super Admin shield badge — sibling of button, outside its grid context */}
                {role === 'superadmin' && (
                  <span
                    aria-label="Super Admin session"
                    title="Super Admin"
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#1C0709',
                      border: '1.5px solid #3D0D15',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Shield size={8} color="#E4373D" aria-hidden="true" />
                  </span>
                )}
              </div>{/* end 32×32 wrapper */}

              {/* Profile dropdown */}
              {profileOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 224,
                    background: '#1E2128',
                    border: '1px solid #2A2E37',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.44)',
                    zIndex: 100,
                    overflow: 'hidden',
                  }}
                >
                  {/* Identity header */}
                  <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #2A2E37' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#B11116',   /* FIX 4: brand red */
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        flexShrink: 0,
                      }}>
                        {user!.initials}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8EAED', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user!.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user!.email}
                        </div>
                        <div style={{ fontSize: 10, color: ROLE_COLORS[role], fontWeight: 600, marginTop: 3, letterSpacing: '0.04em' }}>
                          {ROLE_LABELS[role]}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FIX 5: My Profile + Help & Guidance + divider + Sign out */}
                  <div style={{ padding: '6px' }}>
                    {/* My Profile */}
                    <Link
                      to="/profile"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: '#9BA1AC',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        transition: 'background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,.05)';
                        e.currentTarget.style.color = '#E8EAED';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#9BA1AC';
                      }}
                    >
                      <UserCircle2 size={14} aria-hidden="true" />
                      My Profile
                    </Link>

                    {/* Help & Guidance */}
                    <Link
                      to="/help"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: '#9BA1AC',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        transition: 'background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,.05)';
                        e.currentTarget.style.color = '#E8EAED';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#9BA1AC';
                      }}
                    >
                      <HelpCircle size={14} aria-hidden="true" />
                      Help & Guidance
                    </Link>

                    {/* Divider before destructive action */}
                    <div style={{ height: 1, background: '#2A2E37', margin: '4px 2px' }} />

                    {/* Sign out — handler unchanged: clears session, redirects /login */}
                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); logout(); navigate('/login'); }}
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
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        transition: 'background 120ms, color 120ms',
                        textAlign: 'left',
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
              )}
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
