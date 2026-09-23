import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X, Search, Bell, LogOut, UserCircle2, HelpCircle, Shield, FolderKanban, ChevronDown, KeyRound, Settings } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { NAV, ROLE_COLORS, ROLE_LABELS, getNavPaths, getNavItem, navSubItemPath, isNavGroup } from '../lib/nav';
import type { NavItem } from '../lib/nav';
import { useAuth } from '../lib/auth';
import { NotAuthorized } from '../pages/NotAuthorized';
import { globalSearch } from '../api/search';
import type { UserResult, ProjectResult } from '../api/search';
import { toRole } from '../api/auth';
import { fetchProfile } from '../api/profile';
import { useUnreadNotificationsCount } from '../api/notifications';
import { usePendingApprovalsCount } from '../api/approvals';
import { useTeamLeadSummary } from '../api/teamLead';
import { usePmBlockers } from '../api/pmBlockers';
import { resolveBlockersDateFilter } from '../lib/pmBlockersDateFilter';
import { todayISO } from '../lib/date';

// ─── Workspace search (top nav) ────────────────────────────────────────────────
// Pattern mirrors OneHR's global search: nav items filtered client-side (instant),
// users + projects via a single debounced /api/search call (300ms). All roles.
// Keyboard nav: ArrowUp/Down, Enter to select, Escape to close.

/**
 * The signed-in user's uploaded photo, or null while they have none.
 *
 * Reads the SAME ['profile', email] query the Profile page owns, deliberately: uploading or
 * removing a photo there writes that cache entry directly, so every avatar in the chrome swaps
 * over in the same tick without a refetch or a page reload. The auth user in localStorage only
 * carries initials — it is built from the login response and never sees a later upload, which is
 * why the header kept showing "SG" after a photo was added.
 */
function useProfilePhoto(): string | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['profile', user?.email],
    queryFn: fetchProfile,
    staleTime: 300_000,
    enabled: !!user,
  });
  return data?.photoDataUrl ?? null;
}

/**
 * What goes inside an avatar circle. The circles differ in size and element type across the
 * chrome, so this fills whatever it is dropped into rather than imposing its own dimensions.
 */
function AvatarContent({ photo, initials }: { photo: string | null; initials: string }) {
  if (!photo) return <>{initials}</>;
  return (
    <img
      src={photo}
      alt=""
      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/** A flattened, searchable nav entry — either a top-level NavItem or one of its subItems. */
interface SearchableNavEntry {
  key: string;
  label: string;
  path: string;
  icon: NavItem['icon'];
  /** Set only for a subItem — the owning NavItem's label, shown as result meta text. */
  parentLabel?: string;
}

function WorkspaceSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1);

  const role = user!.role;

  // Every nav item PLUS its sub-headings (status filters, dashboard sections, etc. — see
  // NavItem.subItems in nav.ts), flattened once per role. This is the single source both the
  // sidebar and the search bar read from, so a sub-heading can never drift out of sync with — or
  // expose more than — what NAV[role] actually grants this user.
  const searchableEntries = useMemo<SearchableNavEntry[]>(() => {
    const entries: SearchableNavEntry[] = [];
    for (const section of NAV[role]) {
      for (const entry of section.items) {
        // A group's children are searchable individually (with the group as parentLabel); the
        // group itself has no path of its own, so it isn't a navigable search result.
        const items = isNavGroup(entry) ? entry.children : [entry];
        for (const item of items) {
          entries.push({
            key: item.key, label: item.label, path: item.path, icon: item.icon,
            parentLabel: isNavGroup(entry) ? entry.label : undefined,
          });
          for (const sub of item.subItems ?? []) {
            entries.push({
              key: `${item.key}:${sub.key}`,
              label: sub.label,
              path: navSubItemPath(item, sub),
              icon: item.icon,
              parentLabel: item.label,
            });
          }
        }
      }
    }
    return entries;
  }, [role]);

  // Nav items + sub-headings matched client-side (instant, no debounce). A sub-heading also
  // matches on "<parent label> <its own label>" so e.g. searching "eod" still surfaces "Rejected"
  // under My EOD History, not just the parent item.
  const navMatches = useMemo<SearchableNavEntry[]>(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return searchableEntries
      .filter((n) => {
        const haystack = n.parentLabel ? `${n.parentLabel} ${n.label}`.toLowerCase() : n.label.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 6);
  }, [query, searchableEntries]);

  // 300ms debounce for backend call
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => globalSearch(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const userMatches: UserResult[] = searchData?.users ?? [];
  const projectMatches: ProjectResult[] = searchData?.projects ?? [];

  // Flat list for keyboard navigation indexing
  type ResultItem =
    | { kind: 'nav'; item: SearchableNavEntry }
    | { kind: 'user'; user: UserResult }
    | { kind: 'project'; project: ProjectResult };

  const allResults = useMemo<ResultItem[]>(() => [
    ...navMatches.map((item) => ({ kind: 'nav' as const, item })),
    ...userMatches.map((u) => ({ kind: 'user' as const, user: u })),
    ...projectMatches.map((p) => ({ kind: 'project' as const, project: p })),
  ], [navMatches, userMatches, projectMatches]);

  useEffect(() => { setIdx(-1); }, [query]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onMouse(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setIdx(-1);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setIdx(-1); }
    }
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function projectRoute(): string {
    if (role === 'pm') return '/projects';
    if (role === 'lead') return '/team/projects';
    if (role === 'dm') return '/dm/allocation';
    if (role === 'employee') return '/my-projects';
    return '/projects';
  }

  function handleSelect(result: ResultItem) {
    setOpen(false); setQuery(''); setIdx(-1);
    if (result.kind === 'nav') navigate(result.item.path);
    else if (result.kind === 'user') navigate(`/admin/users?userId=${result.user.id}`);
    else navigate(projectRoute());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, allResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); handleSelect(allResults[idx]); }
    else if (e.key === 'Escape') { setOpen(false); setIdx(-1); }
  }

  const hasResults = navMatches.length > 0 || userMatches.length > 0 || projectMatches.length > 0;
  const showEmpty = !isFetching && !hasResults && debounced.length >= 2;
  const showLoading = isFetching && !hasResults;
  const showDropdown = open && query.trim().length >= 1;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        className="shell-search"
        role="search"
        aria-label="Search workspace"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#1E2128', border: '1px solid #2A2E37', borderRadius: 8,
          padding: '7px 11px', color: '#6B7280', fontSize: 12, minWidth: 188,
        }}
      >
        <Search size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search this workspace..."
          aria-label="Search navigation, people, and projects"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: '#C8CCD2', fontSize: 12, width: '100%', fontFamily: 'Inter, sans-serif',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); setIdx(-1); }}
            aria-label="Clear search"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          role="listbox"
          aria-label="Search results"
          className="nf-r-popover"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300,
            background: '#16181D', border: '1px solid #2A2E37', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,.55)', zIndex: 100,
            maxHeight: 360, overflowY: 'auto',
          }}
        >
          {/* Navigate */}
          {navMatches.length > 0 && (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.08em' }}>Navigate</div>
              {navMatches.map((item, i) => {
                const Icon = item.icon;
                const highlighted = idx === i;
                return (
                  <button key={item.key}
                    onMouseDown={() => handleSelect({ kind: 'nav', item })}
                    onMouseEnter={() => setIdx(i)}
                    onMouseLeave={() => setIdx(-1)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: highlighted ? 'rgba(255,255,255,.06)' : 'none', border: 'none', cursor: 'pointer', color: '#C8CCD2', fontSize: 13, textAlign: 'left' }}>
                    <Icon size={14} style={{ color: '#9BA1AC', flexShrink: 0 }} aria-hidden="true" />
                    {item.parentLabel ? (
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.parentLabel}</div>
                      </div>
                    ) : (
                      item.label
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* People */}
          {userMatches.length > 0 && (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.08em', borderTop: navMatches.length > 0 ? '1px solid #23262D' : 'none' }}>People</div>
              {userMatches.map((u, i) => {
                const globalIdx = navMatches.length + i;
                const highlighted = idx === globalIdx;
                const initials = u.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <button key={u.id}
                    onMouseDown={() => handleSelect({ kind: 'user', user: u })}
                    onMouseEnter={() => setIdx(globalIdx)}
                    onMouseLeave={() => setIdx(-1)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: highlighted ? 'rgba(255,255,255,.06)' : 'none', border: 'none', cursor: 'pointer', color: '#C8CCD2', fontSize: 13, textAlign: 'left' }}>
                    <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                      {initials}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullName}</div>
                      <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email} · {ROLE_LABELS[toRole(u.role)] ?? u.role}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Projects */}
          {projectMatches.length > 0 && (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.08em', borderTop: (navMatches.length > 0 || userMatches.length > 0) ? '1px solid #23262D' : 'none' }}>Projects</div>
              {projectMatches.map((p, i) => {
                const globalIdx = navMatches.length + userMatches.length + i;
                const highlighted = idx === globalIdx;
                return (
                  <button key={p.id}
                    onMouseDown={() => handleSelect({ kind: 'project', project: p })}
                    onMouseEnter={() => setIdx(globalIdx)}
                    onMouseLeave={() => setIdx(-1)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: highlighted ? 'rgba(255,255,255,.06)' : 'none', border: 'none', cursor: 'pointer', color: '#C8CCD2', fontSize: 13, textAlign: 'left' }}>
                    <FolderKanban size={14} style={{ color: '#9BA1AC', flexShrink: 0 }} aria-hidden="true" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>{p.code}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Loading */}
          {showLoading && (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#9BA1AC' }}>Searching…</div>
          )}

          {/* Empty */}
          {showEmpty && (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#9BA1AC' }}>
              No results for &ldquo;{debounced}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar content (shared desktop + mobile) ────────────────────────────────
// All colors hardcoded dark — sidebar NEVER themes regardless of html data-theme.

/** One sidebar row for a routable NavItem — shared by top-level items and a NavGroup's
 *  (indented) children, so the two look and behave identically apart from indentation. */
function NavLinkItem({ item, isActive, badge, indent, onNavClick }: {
  item: NavItem; isActive: boolean; badge: number | undefined; indent?: boolean;
  onNavClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      className="nf-sidebar-item"
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: 'var(--nf-density-nav-pad, 9px 11px)',
        margin: indent ? '1px 8px 1px 22px' : '1px 8px',
        borderRadius: 6,
        textDecoration: 'none',
        position: 'relative',
        fontSize: 13,
        fontWeight: 450,
      }}
      onClick={onNavClick}
    >
      <Icon size={indent ? 15 : 17} style={{ flex: 'none', opacity: isActive ? 1 : 0.8 }} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>

      {badge !== undefined && badge > 0 && (
        <span
          aria-label={`${badge} unread`}
          style={{
            background: 'var(--brand)',
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
}

/** An expandable "Project Manager Views"-style parent row — a button, not a
 *  Link (it has no page of its own), with a chevron that rotates to reflect expanded/collapsed
 *  state. Its own active-state isn't tracked here; each child highlights itself when active. */
function NavGroupRow({ label, icon: Icon, expanded, onToggle }: {
  label: string; icon: NavItem['icon']; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="nf-sidebar-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: 'calc(100% - 16px)',
        padding: 'var(--nf-density-nav-pad, 9px 11px)',
        margin: '1px 8px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 450,
        lineHeight: 'normal',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <Icon size={17} style={{ flex: 'none', opacity: 0.8 }} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <ChevronDown
        size={15}
        aria-hidden="true"
        style={{ flex: 'none', opacity: 0.8, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      />
    </button>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user } = useAuth();
  const location = useLocation();

  const role = user!.role;
  const navSections = NAV[role];

  // Expand/collapse state for NavGroups (e.g. Super Admin's "Project Manager Views" / "Team
  // Lead Views") — local to this mounted Shell, so it resets naturally on logout/login (the
  // whole shell unmounts) without needing to explicitly clear anything. Auto-expands (below)
  // whenever the active route is one of a group's children, but never auto-collapses a group
  // the user opened manually, and each group's state is independent of every other group's.
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    for (const section of navSections) {
      for (const entry of section.items) {
        if (isNavGroup(entry) && entry.children.some(c => c.path === location.pathname)) {
          setExpandedGroups(prev => (prev[entry.key] ? prev : { ...prev, [entry.key]: true }));
        }
      }
    }
  }, [location.pathname, navSections]);
  function toggleGroup(key: string) {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Sidebar Approvals badge, the Team Dashboard "Pending Approval" KPI, and the
  // Approvals page count all read this same live query — see api/approvals.ts.
  // Shared by both roles that have an Approvals page (Team Lead and Project Manager) —
  // the query itself resolves "pending for me" differently server-side per role.
  const pendingApprovalsCount = usePendingApprovalsCount(role === 'lead' || role === 'pm');

  // Sidebar Blockers badge — same "today" summary query (and cache key) as the Team
  // Dashboard's "Open Blockers" KPI fallback, warmed by prefetchTeamLeadLanding right
  // after login, so the two can never disagree. Team Lead only, per that KPI's own scope.
  const { data: teamLeadSummary } = useTeamLeadSummary(
    { from: todayISO(), to: todayISO() },
    true,
    role === 'lead',
  );
  const openBlockersCount = role === 'lead' ? (teamLeadSummary?.activeBlockersCount ?? 0) : 0;

  // Sidebar Blockers badge for PM — scoped to the same date range as the PM Blockers page
  // itself (mode/from/to), counting open blockers (status !== RESOLVED) the same way the page's
  // Needs Response + Acknowledged tiles do, so the badge never disagrees with what the page shows
  // for that range. While on /projects/blockers, reads the live URL params (updates immediately
  // as the user changes the date picker); everywhere else, resolveBlockersDateFilter falls back
  // to the same sessionStorage-persisted range the page itself reads (see
  // pmBlockersDateFilter.ts), or "today" if the page has never been visited this session —
  // matching the page's own first-load default.
  const pmBlockersRange = resolveBlockersDateFilter(
    location.pathname === '/projects/blockers' ? new URLSearchParams(location.search) : new URLSearchParams(),
  ).range;
  const { data: pmRangeBlockers } = usePmBlockers(pmBlockersRange, role === 'pm');
  const pmOpenBlockersCount = role === 'pm'
    ? (pmRangeBlockers ?? []).filter(b => b.status !== 'RESOLVED').length
    : 0;

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
            fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.04em',
            color: '#E8EAED',
          }}>
            NForce Sync
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
        {navSections.map((section, i) => (
          <div key={section.section || i}>
            {/* FIX 7: all sections labeled — matches OneHR's labeled-section pattern.
                A blank section name (single-section roles with nothing left to distinguish, e.g.
                Employee) skips the heading entirely rather than rendering an empty label row. */}
            {section.section && (
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
            )}

            {section.items.map((entry) => {
              function badgeFor(item: NavItem): number | undefined {
                return (role === 'lead' || role === 'pm') && item.key === 'approvals'
                  ? pendingApprovalsCount
                  : role === 'lead' && item.key === 'blockers'
                    ? openBlockersCount
                    : role === 'pm' && item.key === 'blockers'
                      ? pmOpenBlockersCount
                      : item.badge;
              }

              if (isNavGroup(entry)) {
                const expanded = !!expandedGroups[entry.key];
                return (
                  <div key={entry.key}>
                    <NavGroupRow
                      label={entry.label}
                      icon={entry.icon}
                      expanded={expanded}
                      onToggle={() => toggleGroup(entry.key)}
                    />
                    {expanded && entry.children.map(child => (
                      <NavLinkItem
                        key={child.key}
                        item={child}
                        isActive={location.pathname === child.path}
                        badge={badgeFor(child)}
                        indent
                        onNavClick={onNavClick}
                      />
                    ))}
                  </div>
                );
              }

              return (
                <NavLinkItem
                  key={entry.key}
                  item={entry}
                  isActive={location.pathname === entry.path}
                  badge={badgeFor(entry)}
                  onNavClick={onNavClick}
                />
              );
            })}
          </div>
        ))}
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
  const photo = useProfilePhoto();
  const location = useLocation();
  const navigate  = useNavigate();
  const reduced   = useReducedMotion();

  const role         = user!.role;
  const allowedPaths = getNavPaths(role);
  const isAllowed    = allowedPaths.includes(location.pathname)
    || location.pathname === '/'
    || location.pathname === '/change-password'
    // Notifications and Profile have no sidebar entry (reachable only via the topbar bell /
    // avatar dropdown), but every role must still be able to open them.
    || location.pathname === '/notifications'
    || location.pathname === '/profile'
    || location.pathname === '/preferences';

  // FIX 4: derive breadcrumb label from nav map
  const navInfo  = getNavItem(role, location.pathname);
  const pageLabel = navInfo?.item.label
    ?? (location.pathname === '/notifications' ? 'Notifications'
      : location.pathname === '/profile' ? 'Profile'
      : location.pathname === '/preferences' ? 'Preferences'
      : 'Home');

  const bellBadge = useUnreadNotificationsCount();

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
            background: 'linear-gradient(90deg, #050506 0%, var(--brand-deep) 40%, var(--brand) 100%)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid color-mix(in srgb, var(--brand-bright) 22%, transparent)',
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

            {/* Global search — nav items (client-side), people + projects (role-scoped backend) */}
            <WorkspaceSearch />

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
                    background: 'var(--risk)',
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
                    background: 'var(--brand)',
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
                  <AvatarContent photo={photo} initials={user!.initials} />
                </button>

                {/* Super Admin / Admin shield badge — sibling of button, outside its grid context */}
                {(role === 'superadmin' || role === 'admin') && (
                  <span
                    aria-label={role === 'superadmin' ? 'Super Admin session' : 'Admin session'}
                    title={role === 'superadmin' ? 'Super Admin' : 'Admin'}
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: role === 'superadmin' ? '#1C0709' : '#161A3D',
                      border: role === 'superadmin' ? '1.5px solid #3D0D15' : '1.5px solid #2A2F6B',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Shield size={8} color={role === 'superadmin' ? 'var(--risk)' : '#6366F1'} aria-hidden="true" />
                  </span>
                )}
              </div>{/* end 32×32 wrapper */}

              {/* Profile dropdown */}
              {profileOpen && (
                <div
                  role="menu"
                  className="nf-r-popover"
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
                        background: 'var(--brand)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        flexShrink: 0,
                      }}>
                        <AvatarContent photo={photo} initials={user!.initials} />
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

                    {/* Preferences */}
                    <Link
                      to="/preferences"
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
                      <Settings size={14} aria-hidden="true" />
                      Preferences
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

                    {/* Change Password */}
                    <Link
                      to="/change-password"
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
                      <KeyRound size={14} aria-hidden="true" />
                      Change Password
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
                        color: 'var(--risk)',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'Inter, sans-serif',
                        transition: 'background 120ms, color 120ms',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--risk) 8%, transparent)';
                        e.currentTarget.style.color = 'var(--risk)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--risk)';
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
          className="shell-main"
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



