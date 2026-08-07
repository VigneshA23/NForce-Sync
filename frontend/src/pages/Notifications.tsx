import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bell, CheckCheck, Loader2, AlertCircle, ChevronLeft, ChevronRight, Check,
  UserPlus, KeyRound, ClipboardCheck, XCircle, RefreshCcw, Info, Clock,
  AlertTriangle, FolderKanban, CalendarDays, MessageSquare, Users, Megaphone,
  Search, RefreshCw, Inbox, ArrowUpRight,
} from 'lucide-react';
import {
  fetchNotifications,
  markNotificationRead,
  markAllRead,
  useUnreadNotificationsCount,
  type NotificationDto,
} from '../api/notifications';
import { formatDate, formatDateTime, formatTime12h, toLocalISODate, todayISO, yesterdayISO } from '../lib/date';
import { resolveNotificationPriority, type NotificationPriority } from '../lib/notificationPriority';

// ── Notification metadata ───────────────────────────────────────────────────
// Category/generated-by are derived client-side from `type` — the backend
// only sends type/title/message/link/read/createdAt, so this is a
// display-layer classification, not fabricated per-notification data. Colors
// reference CSS var *values* for the icon glyph; bg is a matching tint —
// semantic role indicators, correct in both themes.
//
// Priority is NOT part of this map — it's computed per-notification by
// `resolveNotificationPriority()` (see ../lib/notificationPriority.ts), which
// applies the actual business-impact rules instead of a flat hardcoded value.

type Priority = NotificationPriority;

interface NotificationMeta {
  icon: React.ReactNode;
  color: string;
  bg: string;
  category: string;
  generatedBy: string;
}

const NOTIFICATION_META: Record<string, NotificationMeta> = {
  ACCOUNT_CREATED: {
    icon: <UserPlus size={15} />, color: 'var(--ok)', bg: 'rgba(47,182,124,.12)',
    category: 'Account', generatedBy: 'System',
  },
  PASSWORD_RESET: {
    icon: <KeyRound size={15} />, color: 'var(--warn)', bg: 'rgba(224,169,59,.12)',
    category: 'Account', generatedBy: 'System',
  },
  EOD_APPROVED: {
    icon: <ClipboardCheck size={15} />, color: 'var(--ok)', bg: 'rgba(47,182,124,.12)',
    category: 'EOD', generatedBy: 'Approval Workflow',
  },
  EOD_REJECTED: {
    icon: <XCircle size={15} />, color: 'var(--risk)', bg: 'rgba(228,55,61,.12)',
    category: 'EOD', generatedBy: 'Approval Workflow',
  },
  EOD_CHANGES_REQUESTED: {
    icon: <RefreshCcw size={15} />, color: 'var(--warn)', bg: 'rgba(224,169,59,.12)',
    category: 'EOD', generatedBy: 'Approval Workflow',
  },
  EOD_SUBMITTED: {
    icon: <ClipboardCheck size={15} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)',
    category: 'EOD', generatedBy: 'EOD Workflow',
  },
  // Not emitted by the backend yet — kept ready so the icon/category system
  // needs no frontend changes the day these types start arriving.
  EOD_REMINDER: {
    icon: <Clock size={15} />, color: 'var(--warn)', bg: 'rgba(224,169,59,.12)',
    category: 'Reminder', generatedBy: 'EOD Reminder Service',
  },
  PENDING_CORRECTION: {
    icon: <AlertTriangle size={15} />, color: 'var(--risk)', bg: 'rgba(228,55,61,.12)',
    category: 'EOD', generatedBy: 'Approval Workflow',
  },
  PROJECT_ASSIGNMENT: {
    icon: <FolderKanban size={15} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)',
    category: 'Project', generatedBy: 'Delivery Management',
  },
  LEAVE_APPROVED: {
    icon: <CalendarDays size={15} />, color: 'var(--ok)', bg: 'rgba(47,182,124,.12)',
    category: 'Leave', generatedBy: 'Leave Management',
  },
  LEAVE_REJECTED: {
    icon: <CalendarDays size={15} />, color: 'var(--risk)', bg: 'rgba(228,55,61,.12)',
    category: 'Leave', generatedBy: 'Leave Management',
  },
  HOLIDAY_ANNOUNCEMENT: {
    icon: <Megaphone size={15} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)',
    category: 'System', generatedBy: 'HR',
  },
  MANAGER_COMMENT: {
    icon: <MessageSquare size={15} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)',
    category: 'Manager', generatedBy: 'Team Lead',
  },
  BLOCKER_REPLY: {
    icon: <MessageSquare size={15} />, color: 'var(--risk)', bg: 'rgba(228,55,61,.12)',
    category: 'Blocker', generatedBy: 'Blocker Thread',
  },
  RESOURCE_ALLOCATION: {
    icon: <Users size={15} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)',
    category: 'Project', generatedBy: 'Delivery Management',
  },
  SYSTEM_ANNOUNCEMENT: {
    icon: <Megaphone size={15} />, color: 'var(--txt-dim)', bg: 'var(--raised2)',
    category: 'System', generatedBy: 'System',
  },
};

function defaultMeta(): NotificationMeta {
  return {
    icon: <Info size={15} />, color: 'var(--txt-dim)', bg: 'var(--raised2)',
    category: 'General', generatedBy: 'System',
  };
}

const PRIORITY_META: Record<Priority, { color: string; bg: string }> = {
  High:   { color: 'var(--risk)',   bg: 'rgba(228,55,61,.12)' },
  Medium: { color: 'var(--warn)',   bg: 'rgba(224,169,59,.12)' },
  Low:    { color: 'var(--txt-dim)', bg: 'var(--raised2)' },
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;

  const dateISO = toLocalISODate(d);
  if (dateISO === todayISO()) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }
  const time = formatTime12h(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  if (dateISO === yesterdayISO()) return `Yesterday, ${time}`;
  return `${formatDate(d)}, ${time}`;
}

/** Groups notifications into Today / Yesterday / Earlier buckets, preserving
 *  the incoming order within each bucket. */
function groupByDate(list: NotificationDto[]): { label: string; items: NotificationDto[] }[] {
  const buckets = new Map<string, NotificationDto[]>();
  for (const n of list) {
    const dateISO = toLocalISODate(new Date(n.createdAt));
    const label = dateISO === todayISO() ? 'Today' : dateISO === yesterdayISO() ? 'Yesterday' : 'Earlier';
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(n);
  }
  return ['Today', 'Yesterday', 'Earlier']
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, items: buckets.get(label)! }));
}

/** True at/above `breakpoint`px — used to switch between the master-detail
 *  layout (desktop/tablet) and the single-column list (mobile), matching the
 *  same 900px threshold the shell already uses to collapse its own sidebar. */
function useIsWide(breakpoint = 900): boolean {
  const [isWide, setIsWide] = useState(() => window.matchMedia(`(min-width: ${breakpoint}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = () => setIsWide(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isWide;
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Pill({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color, background: bg,
      padding: '2px 7px', borderRadius: 20, lineHeight: 1.6, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

function DateGroupHeader({ label }: { label: string }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 2,
      padding: '9px 4px 7px',
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--txt-dim)', background: 'var(--shell)',
    }}>
      {label}
    </div>
  );
}

// ── Compact list row (master pane) ──────────────────────────────────────────

function NotificationListItem({
  n, selected, onSelect, onMarkRead, navigable,
}: {
  n: NotificationDto;
  selected: boolean;
  onSelect: (n: NotificationDto) => void;
  onMarkRead: (id: number) => void;
  navigable: boolean;
}) {
  const meta = NOTIFICATION_META[n.type] ?? defaultMeta();
  const priorityValue = resolveNotificationPriority(n);
  const priority = PRIORITY_META[priorityValue];

  function handleMarkRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!n.read) onMarkRead(n.id);
  }

  const row = (
    <div
      className="nf-notif-row"
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(n)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n); } }}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 30px 10px 11px',
        marginBottom: 4,
        borderRadius: 8,
        border: '1px solid ' + (selected ? 'var(--line2)' : 'transparent'),
        borderLeft: n.read ? (selected ? '1px solid var(--line2)' : '3px solid transparent') : '3px solid var(--brand-bright)',
        background: selected ? 'var(--raised2)' : n.read ? 'transparent' : 'rgba(228,55,61,.05)',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: meta.bg, color: meta.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 12.5, fontWeight: n.read ? 500 : 650,
            color: n.read ? 'var(--txt-mut)' : 'var(--txt)',
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {n.title}
          </span>
          <span style={{
            fontSize: 10, color: 'var(--txt-dim)', flexShrink: 0,
            fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
          }}>
            {timeAgo(n.createdAt)}
          </span>
        </div>

        {n.message && (
          <div style={{
            fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {n.message}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <Pill color={meta.color} bg={meta.bg}>{meta.category}</Pill>
          <Pill color={priority.color} bg={priority.bg}>{priorityValue}</Pill>
          {!n.read && (
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-bright)' }} />
          )}
        </div>
      </div>

      {!n.read && (
        <button
          onClick={handleMarkRead}
          aria-label="Mark as read"
          title="Mark as read"
          className="nf-notif-mark-read"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 22, height: 22, borderRadius: 6,
            border: '1px solid var(--line)', background: 'var(--raised2)',
            color: 'var(--txt-mut)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
          }}
        >
          <Check size={11} />
        </button>
      )}
    </div>
  );

  if (navigable && n.link) {
    return <Link to={n.link} onClick={() => onSelect(n)} style={{ display: 'block', textDecoration: 'none' }}>{row}</Link>;
  }
  return row;
}

// ── Detail pane ──────────────────────────────────────────────────────────────

function NotificationDetailPane({ n }: { n: NotificationDto | null }) {
  if (!n) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: 'var(--raised2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <Inbox size={24} style={{ color: 'var(--txt-dim)' }} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--txt-mut)', marginBottom: 4 }}>No notification selected</div>
        <div style={{ fontSize: 12, color: 'var(--txt-dim)', maxWidth: 240 }}>
          Choose a notification from the list to view its full details here.
        </div>
      </div>
    );
  }

  const meta = NOTIFICATION_META[n.type] ?? defaultMeta();
  const priorityValue = resolveNotificationPriority(n);
  const priority = PRIORITY_META[priorityValue];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '26px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, background: meta.bg, color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 6,
        }}>
          {meta.icon}
        </div>
        <Pill color={meta.color} bg={meta.bg}>{meta.category}</Pill>
        <Pill color={priority.color} bg={priority.bg}>{priorityValue} priority</Pill>
        <Pill
          color={n.read ? 'var(--txt-dim)' : 'var(--brand-bright)'}
          bg={n.read ? 'var(--raised2)' : 'rgba(228,55,61,.14)'}
        >
          {n.read ? 'Read' : 'Unread'}
        </Pill>
      </div>

      <h2 style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 19, fontWeight: 700, color: 'var(--txt)',
        margin: '0 0 6px', lineHeight: 1.35, overflowWrap: 'break-word',
      }}>
        {n.title}
      </h2>

      <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: 18 }}>
        via {meta.generatedBy} &middot; {formatDateTime(n.createdAt)}
      </div>

      <div style={{ height: 1, background: 'var(--line)', margin: '0 0 18px' }} />

      <p style={{
        fontSize: 13.5, color: 'var(--txt-mut)', lineHeight: 1.7,
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', margin: '0 0 24px',
      }}>
        {n.message || 'No additional details were provided for this notification.'}
      </p>

      {n.link && (
        <Link
          to={n.link}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8,
            background: 'var(--brand)', color: '#fff', textDecoration: 'none',
            fontSize: 12.5, fontWeight: 600,
          }}
        >
          Open related page <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

// ── Skeleton (master pane) ──────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 11px', marginBottom: 4 }}>
      <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 1 }}>
        <div className="skeleton" style={{ height: 12, width: '55%', borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: '80%', borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="skeleton" style={{ height: 14, width: 46, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 14, width: 40, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
type StatusFilter = 'all' | 'unread' | 'read';
type SortOrder = 'newest' | 'oldest';

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: 'var(--txt)',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
};

export default function Notifications() {
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const qc = useQueryClient();
  const isWide = useIsWide(900);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['notifications', 'list', page],
    queryFn: () => fetchNotifications(page, PAGE_SIZE),
    staleTime: 30_000,
    // Polled on the same 30s cadence as the unread count (useUnreadNotificationsCount)
    // so a new blocker-reply notification appears in the list without a manual refresh.
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const unread = useUnreadNotificationsCount();

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const markAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });

  const notifications = data?.content ?? [];
  const totalPages    = data?.totalPages ?? 0;
  const total         = data?.totalElements ?? 0;

  // Search/filter/sort apply within the currently loaded page — the backend
  // has no query params for these yet, so this stays purely a display-layer
  // refinement of the 20 notifications already fetched for this page.
  const visible = useMemo(() => {
    let list = notifications;
    if (statusFilter === 'unread') list = list.filter((n) => !n.read);
    if (statusFilter === 'read') list = list.filter((n) => n.read);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q) || (n.message ?? '').toLowerCase().includes(q));
    }
    if (sortOrder === 'oldest') list = [...list].reverse();
    return list;
  }, [notifications, statusFilter, search, sortOrder]);

  const groups = groupByDate(visible);
  const selected = notifications.find((n) => n.id === selectedId) ?? null;

  function handleSelect(n: NotificationDto) {
    if (!n.read) markRead.mutate(n.id);
    if (isWide) setSelectedId(n.id);
  }

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} className="nf-notif-page">

      {/* Title row */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 22, fontWeight: 700, color: 'var(--txt)',
            margin: '0 0 4px', letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            Notifications
            {unread > 0 && (
              <span style={{
                padding: '2px 9px',
                background: 'rgba(228,55,61,.15)',
                border: '1px solid rgba(228,55,61,.3)',
                borderRadius: 10, fontSize: 12, fontWeight: 700,
                color: 'var(--brand-bright)',
                fontFamily: 'Inter, sans-serif',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {unread} unread
              </span>
            )}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--txt-mut)', margin: 0 }}>
            {total > 0 ? `${total} total notification${total !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            aria-label="Refresh notifications"
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, background: 'transparent',
              border: '1px solid var(--line)', borderRadius: 8,
              cursor: isFetching ? 'default' : 'pointer', color: 'var(--txt-mut)',
            }}
            onMouseEnter={(e) => { if (!isFetching) { e.currentTarget.style.borderColor = 'var(--brand-bright)'; e.currentTarget.style.color = 'var(--txt)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--txt-mut)'; }}
          >
            <RefreshCw size={14} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>

          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '8px 16px', background: 'transparent',
                border: '1px solid var(--line)', borderRadius: 8,
                cursor: 'pointer', color: 'var(--txt-mut)',
                fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                transition: 'border-color 120ms, color 120ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand-bright)'; e.currentTarget.style.color = 'var(--txt)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--txt-mut)'; }}
            >
              {markAll.isPending
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <CheckCheck size={13} />}
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: search, filter, sort */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
        padding: '10px 12px', background: 'var(--panel)',
        border: '1px solid var(--line)', borderRadius: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', maxWidth: 320,
          background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6, padding: '6px 10px',
        }}>
          <Search size={13} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
          style={selectStyle}
        >
          <option value="all">All notifications</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          aria-label="Sort order"
          style={selectStyle}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Master-detail body */}
      {isLoading ? (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
          <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
      ) : error ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '28px 20px',
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
          color: 'var(--risk)', fontSize: 13,
        }}>
          <AlertCircle size={15} />
          Failed to load notifications. Please refresh.
        </div>
      ) : notifications.length === 0 ? (
        <div style={{
          padding: '64px 20px', textAlign: 'center',
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(228,55,61,.14), rgba(228,55,61,.03))',
            border: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
          }}>
            <Bell size={26} style={{ color: 'var(--brand-bright)' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 5 }}>You're all caught up</div>
          <div style={{ fontSize: 12.5, color: 'var(--txt-dim)', maxWidth: 300, margin: '0 auto' }}>
            EOD approvals, reminders, and account updates will show up here as they happen.
          </div>
        </div>
      ) : (
        <div className="nf-notif-body" style={{
          display: 'flex', border: '1px solid var(--line)', borderRadius: 10,
          background: 'var(--panel)', overflow: 'hidden', flex: 1, minHeight: 0,
        }}>
          {/* Master pane */}
          <div className="nf-notif-list-pane" style={{ overflowY: 'auto', padding: '8px 8px 8px 10px', minWidth: 0 }}>
            {groups.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>
                No notifications match your search or filter.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <DateGroupHeader label={group.label} />
                  {group.items.map((n) => (
                    <NotificationListItem
                      key={n.id}
                      n={n}
                      selected={isWide && n.id === selectedId}
                      onSelect={handleSelect}
                      onMarkRead={(id) => markRead.mutate(id)}
                      // Blocker replies always navigate straight to the conversation's side
                      // panel on click, even on wide screens — the master/detail preview
                      // pane doesn't apply since the useful "detail" is the live thread,
                      // not a text summary.
                      navigable={!isWide || n.type === 'BLOCKER_REPLY'}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Detail pane — desktop/tablet only */}
          {isWide && (
            <div className="nf-notif-detail-pane" style={{ borderLeft: '1px solid var(--line)', minWidth: 0 }}>
              <NotificationDetailPane n={selected} />
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setPage(p => p - 1); setSelectedId(null); }}
              disabled={page === 0}
              style={{
                padding: '6px 10px', background: 'transparent',
                border: '1px solid var(--line)', borderRadius: 6,
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                color: page === 0 ? 'var(--line2)' : 'var(--txt-mut)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => { setPage(p => p + 1); setSelectedId(null); }}
              disabled={page >= totalPages - 1}
              style={{
                padding: '6px 10px', background: 'transparent',
                border: '1px solid var(--line)', borderRadius: 6,
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                color: page >= totalPages - 1 ? 'var(--line2)' : 'var(--txt-mut)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .nf-notif-row:hover { background: var(--raised2) !important; }
        .nf-notif-mark-read { opacity: 0; transition: opacity 120ms ease, border-color 120ms ease, color 120ms ease; }
        .nf-notif-row:hover .nf-notif-mark-read,
        .nf-notif-mark-read:focus-visible { opacity: 1; }
        .nf-notif-mark-read:hover { color: var(--txt); border-color: var(--brand-bright); }

        .nf-notif-list-pane { flex: 1 1 auto; }
        .nf-notif-detail-pane { flex: 1 1 auto; }

        /* Wide screens: fixed page height so only the list/detail panes scroll,
           not the whole page — this is the core ask (stop scrolling the page
           when there's unused horizontal space to use instead). */
        @media (min-width: 900px) {
          .nf-notif-page { height: calc(100dvh - 112px); }
          .nf-notif-body { flex: 1 1 auto; }
          .nf-notif-list-pane { flex: 0 0 380px; border-right: 1px solid var(--line); }
          .nf-notif-detail-pane { flex: 1 1 auto; }
        }
        @media (min-width: 1180px) {
          .nf-notif-list-pane { flex: 0 0 420px; }
        }
      `}</style>
    </div>
  );
}
