import { Card } from './KpiCard';
import { EodEntryBody, FieldLabel } from '../pages/approvals/shared';
import type { EodEntryDto } from '../api/eod';
import { formatDateTime } from '../lib/date';

// Read-only rendering of one submitted EOD report for someone else's day (Team EOD Status
// detail). The Submit EOD page is an editable form bound to the logged-in user, so this is a
// separate, display-only view: a header block (status badge, day type, work location, time
// adjustment, overtime) followed by EodEntryBody — the same Tasks / Next-day plan / Remarks
// rendering the approvals modal and the EOD inbox panel already share.

const ENTRY_STATUS: Record<string, { color: string; label: string }> = {
  SUBMITTED:          { color: 'var(--warn)', label: 'Pending approval' },
  PARTIALLY_APPROVED: { color: 'var(--warn)', label: 'Partially approved' },
  APPROVED:           { color: 'var(--ok)',   label: 'Approved' },
};

function titleCase(v: string | null | undefined): string {
  if (!v) return '—';
  return v.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function adjustmentText(entry: EodEntryDto): string | null {
  if (!entry.timeAdjustmentType || !entry.timeAdjustmentMinutes) return null;
  const m = entry.timeAdjustmentMinutes;
  const dur = m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
  return `${titleCase(entry.timeAdjustmentType)} · ${dur}`;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600 }}>{children}</div>
    </div>
  );
}

function PlainLogBody({ entry }: { entry: EodEntryDto }) {
  const lines = entry.logLines ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FieldLabel>Log</FieldLabel>
      {lines.length > 0 ? lines.map(l => (
        <div key={l.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)' }}>{l.categoryName}</span>
            <span style={{ fontSize: 12.5, color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{Number(l.hours)}h</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{l.description || '—'}</div>
        </div>
      )) : (
        <div style={{ fontSize: 12.5, color: 'var(--txt)', background: 'var(--raised)', borderRadius: 6, padding: 10 }}>
          {entry.logSummary || '—'}
          {entry.logTotalHours != null && (
            <span style={{ color: 'var(--txt-dim)', marginLeft: 8, fontFamily: '"JetBrains Mono", monospace' }}>
              ({Number(entry.logTotalHours)}h)
            </span>
          )}
        </div>
      )}
      <div>
        <FieldLabel>Notes</FieldLabel>
        <div style={{ fontSize: 12.5, color: 'var(--txt)', background: 'var(--raised)', borderRadius: 6, padding: 10 }}>
          {entry.logNotes || '—'}
        </div>
      </div>
    </div>
  );
}

export function EodReportView({ entry }: { entry: EodEntryDto }) {
  const status = ENTRY_STATUS[entry.status] ?? { color: 'var(--txt-dim)', label: titleCase(entry.status) };
  const adjustment = adjustmentText(entry);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--line)',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, alignItems: 'start',
      }}>
        <Meta label="Report status">
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
            background: `color-mix(in srgb, ${status.color} 16%, transparent)`,
            border: `1px solid color-mix(in srgb, ${status.color} 30%, transparent)`,
            color: status.color, fontSize: 11, fontWeight: 600,
          }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }} />
            {status.label}
          </span>
        </Meta>
        <Meta label="Day type">{titleCase(entry.dayType)}</Meta>
        <Meta label="Work location">{titleCase(entry.workLocation)}</Meta>
        {adjustment && <Meta label="Time adjustment">{adjustment}</Meta>}
        {entry.isOvertime && entry.overtimeHours != null && (
          <Meta label="Overtime">
            <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{Number(entry.overtimeHours)}h</span>
          </Meta>
        )}
        {entry.submittedAt && <Meta label="Submitted">{formatDateTime(entry.submittedAt)}</Meta>}
        {entry.decidedByName && (
          <Meta label="Decided by">{entry.decidedByName}</Meta>
        )}
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
        {entry.entryForm === 'PLAIN_LOG' ? <PlainLogBody entry={entry} /> : <EodEntryBody entry={entry} />}
      </div>
    </Card>
  );
}
