import { ChevronLeft, ChevronRight } from 'lucide-react';

// ── Shared pagination footer ─────────────────────────────────────────────────
// The ONE pagination control for the whole app — "Showing X to Y of Z <label>" on
// the left, prev arrow / current-page badge / next arrow on the right. Extracted from
// pages/lead/Blockers.tsx (the reference implementation every other page's pagination
// was asked to match), so every list/table in every role points at this component
// instead of re-implementing its own pager.
//
// `page`/`totalPages` are always 1-indexed for DISPLAY, regardless of how a caller's
// own state is indexed internally (e.g. a 0-indexed `page` state) — translate at the
// call site (`page={pageSafe + 1}`, `onPageChange={p => setPage(p - 1)}`) rather than
// changing this component's convention per caller.

export function Pagination({
  page, totalPages, totalItems, pageSize, onPageChange,
  itemLabel = 'results',
  style,
}: {
  /** Current page, 1-indexed. */
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Plural noun for the "Showing X to Y of Z <itemLabel>" line, e.g. "blockers", "members". */
  itemLabel?: string;
  /** Overrides the outer row's padding/etc. for pages whose surrounding panel uses a
   *  different gutter than Blockers' own 20px (e.g. a 16px-gutter table). */
  style?: React.CSSProperties;
}) {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px', borderTop: '1px solid var(--line)',
      ...style,
    }}>
      <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
        {totalItems === 0
          ? `Showing 0 of 0 ${itemLabel}`
          : `Showing ${from} to ${to} of ${totalItems} ${itemLabel}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          style={{
            display: 'flex', padding: 5, borderRadius: 6,
            background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
            cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span style={{
          minWidth: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, background: 'var(--risk)', color: '#fff', fontSize: 12, fontWeight: 700,
        }}>
          {page}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
          style={{
            display: 'flex', padding: 5, borderRadius: 6,
            background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
            cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1,
          }}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
