import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { DateRangeSelector } from '../../components/DateRangeSelector';
import { Card } from '../../components/KpiCard';
import { useMyReportsMemberStatuses } from '../../api/myReports';
import { todayISO, formatDateShort, formatDateRange } from '../../lib/date';
import { extractError } from '../approvals/PieceCard';
import { OverviewSummary } from './OverviewSummary';
import { OverviewList, type OverviewView } from './OverviewList';
import { overviewWording, rangeKind, summarizeMembers } from './overviewCounts';

// How long the one-time ring sweep takes (RingGauge animates for 700ms), plus a little slack.
const RING_ANIMATION_MS = 900;

export default function MyReportsOverview() {
  const today = todayISO();
  const [range, setRange] = useState({ from: today, to: today });

  type QuickMode = 'today' | 'yesterday' | 'range';
  const [mode, setMode] = useState<QuickMode>('today');

  // Lives here, not in the list, so a date change (which swaps the data for a loading state) keeps the
  // search text and status chip the user had.
  const [view, setView] = useState<OverviewView>({ query: '', filter: 'ALL' });

  function handleQuick(kind: 'today' | 'yesterday') {
    setMode(kind);
    if (kind === 'today') {
      setRange({ from: today, to: today });
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setRange({ from: y, to: y });
    }
  }

  function handleApplyRange(from: string, to: string) {
    setMode('range');
    setRange({ from, to });
  }

  const dateLabel =
    mode === 'today'
      ? `Today, ${formatDateShort(today)}`
      : mode === 'yesterday'
      ? `Yesterday, ${formatDateShort(range.from)}`
      : formatDateRange(range);

  const { data: members, isError, error, refetch, isFetching } = useMyReportsMemberStatuses(range);

  // Ring sweeps in once, on the first data that arrives — never on search, filter or a later date change.
  const reducedMotion = useReducedMotion();
  const [ringSettled, setRingSettled] = useState(false);
  const hasData = members !== undefined;
  useEffect(() => {
    if (!hasData || ringSettled) return;
    const t = setTimeout(() => setRingSettled(true), RING_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [hasData, ringSettled]);
  const animateRing = hasData && !ringSettled && !reducedMotion;

  // A failed background refresh keeps showing the last good data; only a failure with nothing to show is an error.
  const failed = isError && !members;

  const counts = members ? summarizeMembers(members) : null;
  const wording = counts ? overviewWording(rangeKind(range, today), range, counts) : null;
  const subtitle = wording?.subtitle ?? (
    rangeKind(range, today) === 'today' ? 'Who has submitted today and who needs a nudge.' : 'EOD submission status for the selected dates.'
  );

  return (
    <div>
      {/* Header stays visible in every state, including errors, so the date can still be changed. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
            Team Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <DateRangeSelector
          mode={mode}
          range={range}
          todayISO={today}
          label={dateLabel}
          onSelectQuick={handleQuick}
          onApplyRange={handleApplyRange}
        />
      </div>

      {failed ? (
        <div role="alert"><Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 4 }}>Failed to load overview.</div>
          <div style={{ color: 'var(--txt-mut)', fontSize: 12, marginBottom: 14 }}>{extractError(error)}</div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)',
              borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: isFetching ? 'not-allowed' : 'pointer',
              opacity: isFetching ? 0.6 : 1,
            }}
          >
            {isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </Card></div>
      ) : (
        <>
          <OverviewSummary counts={counts} wording={wording} animateRing={animateRing} />
          <OverviewList members={members} view={view} onViewChange={setView} />
        </>
      )}
    </div>
  );
}
