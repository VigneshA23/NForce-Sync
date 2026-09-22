import { X } from 'lucide-react';
import { Card } from './KpiCard';
import { Avatar, avatarColor } from './BlockerThread';
import { EodEntryBody } from '../pages/approvals/shared';
import { useEodEntry } from '../api/eod';
import { formatDate as fmtDate } from '../lib/date';

// The 3rd "View EOD" panel on the EOD Inbox pages (lead/employee/pm) — strictly read-only, no
// Approve/Reject/Request-Clarification affordances. Reuses EodEntryBody (the same Tasks/Next-day
// plan/Remarks rendering the Approvals SubmissionDetailModal uses) rather than a new component,
// since that body was already pure display with nothing interactive in it.
export function EodDetailPanel({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  const { data: entry, isPending, isError } = useEodEntry(entryId);

  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 88px)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {entry && <Avatar name={entry.employeeName} bg={avatarColor(entry.employeeName)} size={34} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>
              {entry ? `${entry.employeeName}, ${fmtDate(entry.entryDate)}` : 'EOD entry'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>Read-only</div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close EOD detail"
          style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2, flexShrink: 0 }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: '14px 20px 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {isPending ? (
          <div className="skeleton" style={{ height: 160, borderRadius: 8 }} />
        ) : isError || !entry ? (
          <div style={{ fontSize: 12.5, color: 'var(--risk)' }}>Failed to load this EOD entry.</div>
        ) : (
          <EodEntryBody entry={entry} />
        )}
      </div>
    </Card>
  );
}
