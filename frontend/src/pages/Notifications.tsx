import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bell, CheckCheck, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  UserPlus, KeyRound, ClipboardCheck, XCircle, RefreshCcw, Info,
} from 'lucide-react';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllRead,
  type NotificationDto,
} from '../api/notifications';
import { formatDate } from '../lib/date';

// ── Type metadata ─────────────────────────────────────────────────────────────
// Colors reference CSS var *values* for the icon glyph; bg is a 12% tint.
// These are semantic role indicators, not theme surfaces — correct both modes.

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  ACCOUNT_CREATED:       { icon: <UserPlus size={14} />,       color: 'var(--ok)',   bg: 'rgba(47,182,124,.12)' },
  PASSWORD_RESET:        { icon: <KeyRound size={14} />,       color: 'var(--warn)', bg: 'rgba(224,169,59,.12)' },
  EOD_APPROVED:          { icon: <ClipboardCheck size={14} />, color: 'var(--ok)',   bg: 'rgba(47,182,124,.12)' },
  EOD_REJECTED:          { icon: <XCircle size={14} />,        color: 'var(--risk)', bg: 'rgba(228,55,61,.12)' },
  EOD_CHANGES_REQUESTED: { icon: <RefreshCcw size={14} />,     color: 'var(--warn)', bg: 'rgba(224,169,59,.12)' },
  EOD_SUBMITTED:         { icon: <ClipboardCheck size={14} />, color: 'var(--info)', bg: 'rgba(76,141,214,.12)' },
};

function defaultMeta() {
  return { icon: <Info size={14} />, color: 'var(--txt-dim)', bg: 'var(--raised2)' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotificationRow({ n, onRead }: { n: NotificationDto; onRead: (id: number) => void }) {
  const meta = TYPE_META[n.type] ?? defaultMeta();

  const inner = (
    <div
      onClick={() => { if (!n.read) onRead(n.id); }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 20px',
        background: n.read ? 'transparent' : 'rgba(228,55,61,.04)',
        borderBottom: '1px solid var(--line)',
        cursor: (!n.read || n.link) ? 'pointer' : 'default',
        transition: 'background 120ms',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => {
        if (!n.read || n.link)
          (e.currentTarget as HTMLDivElement).style.background = 'var(--raised2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'rgba(228,55,61,.04)';
      }}
    >
      {/* Unread dot */}
      <div style={{ width: 8, flexShrink: 0, paddingTop: 8, display: 'flex', justifyContent: 'center' }}>
        {!n.read && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-bright)', display: 'block' }} />
        )}
      </div>

      {/* Type icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 8,
        background: meta.bg, color: meta.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: n.read ? 400 : 600,
          color: n.read ? 'var(--txt-mut)' : 'var(--txt)',
          marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {n.title}
        </div>
        {n.message && (
          <div style={{ fontSize: 12, color: 'var(--txt-dim)', lineHeight: 1.45, marginBottom: 4 }}>
            {n.message}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
          {timeAgo(n.createdAt)}
        </div>
      </div>
    </div>
  );

  if (n.link) {
    return <Link to={n.link} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>;
  }
  return inner;
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ width: 8, flexShrink: 0 }} />
      <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
        <div className="skeleton" style={{ height: 13, width: '55%', borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 11, width: '80%', borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: '20%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function Notifications() {
  const [page, setPage] = useState(0);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', 'list', page],
    queryFn: () => fetchNotifications(page, PAGE_SIZE),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
  });

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

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 24, fontWeight: 700, color: 'var(--txt)',
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
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            {total > 0 ? `${total} notification${total !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>

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

      {/* Notifications list card */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
        marginBottom: totalPages > 1 ? 16 : 0,
      }}>
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 20px', color: 'var(--risk)', fontSize: 13 }}>
            <AlertCircle size={15} />
            Failed to load notifications. Please refresh.
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--raised2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Bell size={22} style={{ color: 'var(--txt-dim)' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>You're all caught up</div>
            <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No notifications yet.</div>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage(p => p - 1)}
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
              onClick={() => setPage(p => p + 1)}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
