import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Check, Minus, ShieldCheck, Monitor } from 'lucide-react';
import { listRoles } from '../../api/admin';
import { GlobalLoader } from '../../components/GlobalLoader';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';

// ── Data derived from grep -rn "@PreAuthorize" backend/src ────────────────────
//
// Only these tiers are enforced at the API (Spring Security @PreAuthorize).
// All other role distinctions — TEAMLEAD, DM, FINANCE, LEADERSHIP — are
// enforced by the frontend routing layer only (nav.ts + Shell access guard).
//
// User administration (user CRUD, audit log, role info, admin stats) is owned by Admin —
// split off from Super Admin, which keeps system-wide operational oversight (business rules,
// org masters, Reportee Views) but can no longer perform user-administration actions, at
// either layer.
//
// This page is READ-ONLY. Permissions are code-defined and cannot be changed here.

const ROLE_ORDER = ['EMPLOYEE', 'TEAMLEAD', 'PM', 'DM', 'FINANCE', 'LEADERSHIP', 'ADMIN', 'SUPERADMIN'];

interface PermRow {
  label: string;
  endpoint: string;
  roles: string[];  // which roles can call this
  tier: 'api' | 'ui'; // api = @PreAuthorize enforced; ui = frontend routing only
}

interface PermGroup {
  label: string;
  rows: PermRow[];
}

const GROUPS: PermGroup[] = [
  {
    label: 'Authenticated: all roles',
    rows: [
      { label: 'Submit & view own EOD',       endpoint: 'POST /api/eod, GET /api/eod',           roles: ['EMPLOYEE','TEAMLEAD','PM','DM','FINANCE','LEADERSHIP','ADMIN','SUPERADMIN'], tier: 'api' },
      { label: 'View / approve EOD entries',  endpoint: 'GET /api/approvals/pending',             roles: ['EMPLOYEE','TEAMLEAD','PM','DM','FINANCE','LEADERSHIP','ADMIN','SUPERADMIN'], tier: 'api' },
      { label: 'Read org masters',            endpoint: 'GET /api/org/*',                         roles: ['EMPLOYEE','TEAMLEAD','PM','DM','FINANCE','LEADERSHIP','ADMIN','SUPERADMIN'], tier: 'api' },
      { label: 'Profile & Notifications',     endpoint: 'GET /api/users/me, GET /api/notifications', roles: ['EMPLOYEE','TEAMLEAD','PM','DM','FINANCE','LEADERSHIP','ADMIN','SUPERADMIN'], tier: 'api' },
    ],
  },
  {
    label: 'Project management: PM + Super Admin',
    rows: [
      { label: 'List & create projects',      endpoint: 'GET/POST /api/projects',                 roles: ['PM','SUPERADMIN'], tier: 'api' },
      { label: 'Update projects',             endpoint: 'PUT /api/projects/:id',                  roles: ['PM','SUPERADMIN'], tier: 'api' },
      { label: 'Manage project allocation',   endpoint: 'GET/POST /api/allocation',               roles: ['PM','SUPERADMIN'], tier: 'api' },
    ],
  },
  {
    label: 'User administration: Admin only',
    rows: [
      { label: 'User management (CRUD)',       endpoint: 'GET/POST/PATCH/DELETE /api/users',       roles: ['ADMIN'], tier: 'api' },
      { label: 'Audit log (read all)',         endpoint: 'GET /api/audit',                         roles: ['ADMIN'], tier: 'api' },
      { label: 'Role information',             endpoint: 'GET /api/roles',                         roles: ['ADMIN'], tier: 'api' },
      { label: 'Admin stats dashboard',        endpoint: 'GET /api/admin/stats',                   roles: ['ADMIN'], tier: 'api' },
      { label: 'Shift definitions (read)',     endpoint: 'GET /api/admin/business-rules/shifts',   roles: ['ADMIN','SUPERADMIN'], tier: 'api' },
      { label: 'Write org masters',            endpoint: 'POST/PATCH/DELETE /api/org/*',           roles: ['ADMIN','SUPERADMIN'], tier: 'api' },
    ],
  },
  {
    label: 'Executive oversight: Super Admin only',
    rows: [
      { label: 'Executive Dashboard',          endpoint: 'GET /api/executive/dashboard',           roles: ['SUPERADMIN'], tier: 'api' },
    ],
  },
  {
    label: 'System configuration: Super Admin only',
    rows: [
      { label: 'Business rules config',        endpoint: 'GET/PUT /api/admin/business-rules/*',    roles: ['SUPERADMIN'], tier: 'api' },
    ],
  },
  {
    label: 'Navigation: UI routing only (not backend-enforced)',
    rows: [
      { label: 'Team dashboard & approvals',  endpoint: '/team/*', roles: ['TEAMLEAD','SUPERADMIN'], tier: 'ui' },
      { label: 'Delivery management',         endpoint: '/dm/*',   roles: ['DM','SUPERADMIN'],       tier: 'ui' },
      { label: 'Finance modules',             endpoint: '/finance/*', roles: ['FINANCE','SUPERADMIN'], tier: 'ui' },
      { label: 'Org-wide analytics',          endpoint: '/leadership/*', roles: ['LEADERSHIP','SUPERADMIN'], tier: 'ui' },
      { label: 'User Administration console', endpoint: '/admin/dashboard, /admin/users, /admin/roles, /admin/audit', roles: ['ADMIN'], tier: 'ui' },
      { label: 'Organization Masters console', endpoint: '/admin/org-masters', roles: ['ADMIN','SUPERADMIN'], tier: 'ui' },
      { label: 'Executive Dashboard',         endpoint: '/admin/executive-dashboard', roles: ['SUPERADMIN'], tier: 'ui' },
      { label: 'System configuration console', endpoint: '/admin/rules, /admin/integrations, /admin/ai', roles: ['SUPERADMIN'], tier: 'ui' },
      { label: 'Reportee Views (read-only)',  endpoint: '/admin/reportee/*', roles: ['SUPERADMIN'], tier: 'ui' },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RolesAccess() {
  const { data: roles, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });

  // Same fix as UserManagement's table: measures the actual space left below this element
  // on screen so the horizontal scrollbar for this wide (11-column) permissions matrix sits
  // at a fixed, always-visible spot near the top of the viewport, on any screen size —
  // instead of the table growing the whole page and hiding it below the fold.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    function recompute() {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setTableMaxHeight(Math.max(200, window.innerHeight - top - 16));
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  });

  const roleMeta = (roles ?? []).reduce<Record<string, { color: string; label: string }>>((acc, r) => {
    const frontendRole = toRole(r.key);
    acc[r.key] = {
      color: ROLE_COLORS[frontendRole] ?? 'var(--txt-dim)',
      label: ROLE_LABELS[frontendRole] ?? r.displayName,
    };
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
          fontSize: 24, fontWeight: 700,
          color: 'var(--txt)', margin: '0 0 4px',
          letterSpacing: '-0.01em',
        }}>
          Roles &amp; Access
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          What each role can do. Permissions are defined in code and cannot be changed from this screen.
        </p>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        padding: '12px 16px', marginBottom: 20,
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--txt-mut)' }}>
          <ShieldCheck size={13} style={{ color: 'var(--ok)' }} />
          <strong style={{ color: 'var(--txt)' }}>API-enforced:</strong>
          checked by Spring Security <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, background: 'var(--raised2)', padding: '1px 5px', borderRadius: 3 }}>@PreAuthorize</code>; cannot be bypassed
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--txt-mut)' }}>
          <Monitor size={13} style={{ color: 'var(--info)' }} />
          <strong style={{ color: 'var(--txt)' }}>UI-only:</strong>
          enforced by frontend routing; backend accepts any authenticated call to these paths
        </div>
      </div>

      {isPending && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <GlobalLoader fullScreen={false} compact label="Loading roles..." />
        </div>
      )}

      {isError && (
        <div style={{ padding: '32px 20px', textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load roles.</div>
          <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {roles && (
        <>
          {/* Role name strip */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
            {/* tableMaxHeight (measured above) bounds this so its own scrollbars — both the
                horizontal one for the 11-column matrix and the vertical one for however many
                permission rows there are — sit at a fixed, always-visible spot on screen
                rather than requiring a scroll to the bottom of a long page to discover them. */}
            <div
              ref={scrollRef}
              className="nf-scroll-shadow-x"
              style={{
                overflowX: 'auto', overflowY: 'auto',
                maxHeight: tableMaxHeight != null ? tableMaxHeight : 'calc(100vh - var(--nf-table-chrome))',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 740 }}>
                <thead>
                  <tr style={{ background: 'var(--raised)', borderBottom: '2px solid var(--line)' }}>
                    <th style={thLeft}>Permission / Route</th>
                    <th style={{ ...thLeft, width: 180, color: 'var(--txt-dim)', fontSize: 10 }}>Endpoint / Path</th>
                    {ROLE_ORDER.map((key) => {
                      const color = roleMeta[key]?.color ?? 'var(--txt-dim)';
                      const label = roleMeta[key]?.label ?? key;
                      return (
                        <th key={key} style={thCenter}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block' }} />
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt-mut)', letterSpacing: '0.04em', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                              {label.replace(' ', ' ')}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th style={{ ...thCenter, width: 72 }}>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((group, gi) => (
                    <>
                      <tr key={`g-${gi}`} style={{ background: 'var(--raised2)', borderTop: gi > 0 ? '2px solid var(--line)' : undefined }}>
                        <td colSpan={ROLE_ORDER.length + 3} style={{
                          padding: '7px 16px',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: 'var(--txt-dim)',
                        }}>
                          {group.label}
                        </td>
                      </tr>
                      {group.rows.map((row, ri) => (
                        <tr
                          key={`r-${gi}-${ri}`}
                          style={{ borderBottom: '1px solid var(--line)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--raised2)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                        >
                          <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
                            {row.label}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <code style={{ fontSize: 10, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                              {row.endpoint}
                            </code>
                          </td>
                          {ROLE_ORDER.map((roleKey) => {
                            const granted = row.roles.includes(roleKey);
                            const color   = roleMeta[roleKey]?.color ?? 'var(--txt-dim)';
                            return (
                              <td key={roleKey} style={{ padding: '10px 6px', textAlign: 'center' }}>
                                {granted ? (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 20, height: 20, borderRadius: 5,
                                    background: row.tier === 'api' ? `${color}1a` : 'rgba(76,141,214,.12)',
                                    color: row.tier === 'api' ? color : 'var(--info)',
                                  }}>
                                    <Check size={11} strokeWidth={2.5} aria-label="Granted" />
                                  </span>
                                ) : (
                                  <Minus size={11} style={{ color: 'var(--line2)' }} aria-label="Not granted" />
                                )}
                              </td>
                            );
                          })}
                          <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                            {row.tier === 'api' ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                                padding: '2px 6px', borderRadius: 4,
                                background: 'rgba(47,182,124,.12)', color: 'var(--ok)',
                                border: '1px solid rgba(47,182,124,.25)',
                              }}>
                                <ShieldCheck size={9} /> API
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                                padding: '2px 6px', borderRadius: 4,
                                background: 'rgba(76,141,214,.12)', color: 'var(--info)',
                                border: '1px solid rgba(76,141,214,.25)',
                              }}>
                                <Monitor size={9} /> UI
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role cards below for description/context */}
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--line)', borderTop: 'none',
            borderRadius: '0 0 10px 10px', padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Role descriptions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {roles.map((role) => {
                const frontendRole = toRole(role.key);
                const color = ROLE_COLORS[frontendRole] ?? 'var(--txt-dim)';
                return (
                  <div key={role.key} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 12px', background: 'var(--raised2)',
                    border: '1px solid var(--line)', borderRadius: 8,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', background: color,
                      flexShrink: 0, marginTop: 4,
                    }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>
                        {role.displayName}
                        {role.isReadOnly && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'rgba(224,169,59,.12)', border: '1px solid rgba(224,169,59,.3)', color: 'var(--warn)' }}>
                            VIEW ONLY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt-dim)', lineHeight: 1.45 }}>{role.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// position:sticky + top:0 pins the header row to the top of the scroll container (see
// RolesAccess's scrollRef div) instead of it scrolling away with the permission rows below
// it. Needs its own opaque background (not just the parent <tr>'s) so scrolled-under rows
// don't show through once the header detaches into its stuck position.
const thLeft: React.CSSProperties = {
  padding: '10px 16px', fontSize: 10, fontWeight: 700,
  color: 'var(--txt-dim)', textAlign: 'left',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  whiteSpace: 'nowrap', minWidth: 160,
  position: 'sticky', top: 0, zIndex: 1, background: 'var(--raised)',
};

const thCenter: React.CSSProperties = {
  ...thLeft,
  textAlign: 'center',
  minWidth: 52,
};
