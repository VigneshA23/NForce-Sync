import type { UseQueryResult } from '@tanstack/react-query';
import type { UtilizationEntries, UtilizationEntry } from '../../../api/teamUtilization';
import { extractError } from '../../approvals/shared';
import { STATUS_META, fmtDay, fmtHours, fmtPct } from './utilizationLogic';

const MONO = '"JetBrains Mono", monospace';

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    }}>
      {children}
    </span>
  );
}

/** Productive / Non-productive from task_category.is_productive — there is no billable data in the system. */
function ProductiveChip({ productive }: { productive: boolean }) {
  return productive ? (
    <span title="Counts toward utilization" style={{
      fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 999, color: 'var(--info)',
      background: 'color-mix(in srgb, var(--info) 14%, transparent)',
    }}>
      Productive
    </span>
  ) : (
    <span title="Does not count toward utilization" style={{
      fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 999, color: 'var(--txt-mut)',
      background: 'var(--raised2)',
    }}>
      Non-productive
    </span>
  );
}

function EntryCard({ e }: { e: UtilizationEntry }) {
  return (
    <li style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', background: 'var(--panel)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)' }}>{e.projectCode ?? 'No project'}</span>
          {e.projectName && <span style={{ fontSize: 12, color: 'var(--txt-mut)', marginLeft: 8 }}>{e.projectName}</span>}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{fmtHours(e.hours)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 6px', flexWrap: 'wrap' }}>
        {e.category && <span style={{ fontSize: 11.5, color: 'var(--txt-mut)' }}>{e.category}</span>}
        <ProductiveChip productive={e.productive} />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--txt)', overflowWrap: 'anywhere' }}>{e.description || '—'}</div>
    </li>
  );
}

/**
 * Left-hand box of the expanded row: the submitted EOD entries behind the selected date.
 * No reminder button here by design — see the follow-up item "reporting-scope reminder POST".
 */
export function EntriesPanel({
  date, query,
}: {
  date: string | null;
  query: UseQueryResult<UtilizationEntries>;
}) {
  const { data, isPending, isError, error, refetch } = query;
  const dateLabel = date ? fmtDay(date) : '';

  let body: React.ReactNode;
  if (!date || isPending) {
    body = (
      <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="skeleton" style={{ height: 78, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 78, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 14, width: '40%', borderRadius: 4 }} />
      </div>
    );
  } else if (isError || !data) {
    body = (
      <div role="alert" style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>
        <div style={{ color: 'var(--risk)', marginBottom: 8 }}>Couldn't load the entries for {dateLabel}. {extractError(error)}</div>
        <button type="button" className="tu-retry" onClick={() => refetch()}>Retry</button>
      </div>
    );
  } else if (data.entries.length === 0) {
    body = (
      <p className="tu-empty-note" style={{ margin: 0, color: 'var(--txt-mut)', fontSize: 13, lineHeight: 1.5 }}>
        {data.holiday ? 'Company holiday — no EOD is expected.'
          : data.leave ? 'On approved leave — no EOD is expected.'
          : `No EOD submitted for ${dateLabel}.`}
      </p>
    );
  } else {
    const meta = data.status ? STATUS_META[data.status] : null;
    body = (
      <>
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.entries.map(e => <EntryCard key={e.taskId} e={e} />)}
        </ul>
        <div className="tu-total" style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          paddingTop: 10, borderTop: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>
            Total <b style={{ fontFamily: MONO, color: 'var(--txt)' }}>{fmtHours(data.totalHours)}</b>
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--txt-mut)' }} title="Utilization counts approved productive hours only">
            {data.utilizationPct === null
              ? 'Not counted toward utilization'
              : <>Utilization <b style={{ fontFamily: MONO, color: meta?.color ?? 'var(--txt)' }}>{fmtPct(data.utilizationPct)}</b></>}
            {meta && data.utilizationPct !== null && <span style={{ color: meta.color }}> · {meta.label}</span>}
          </span>
        </div>
        {data.hasPendingApproval && (
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--txt-dim)' }}>
            Awaiting approval — hours are not counted toward utilization until approved.
          </p>
        )}
      </>
    );
  }

  return (
    <div className="tu-panel">
      <h3 style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--txt-mut)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Entries for {dateLabel || '…'}
        {data?.leave && <Badge color="var(--info)">Leave</Badge>}
        {data?.holiday && <Badge color="var(--txt-mut)">Holiday</Badge>}
      </h3>
      <div className="tu-panel-body">{body}</div>
    </div>
  );
}
