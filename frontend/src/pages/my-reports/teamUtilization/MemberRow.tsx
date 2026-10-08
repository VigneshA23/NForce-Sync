import { ChevronDown } from 'lucide-react';
import type { UtilizationMember, UtilizationSummary } from '../../../api/teamUtilization';
import { MemberDetail } from './MemberDetail';
import { ColorPill, StatusAvatar } from '../eodStatusUi';
import { UtilizationTrack } from './UtilizationTrack';
import { STATUS_META, fmtHours, fmtPct } from './utilizationLogic';

const MONO = '"JetBrains Mono", monospace';

export function MemberRow({
  member, summary, today, open, mounted, onToggle,
}: {
  member: UtilizationMember;
  summary: UtilizationSummary;
  today: string;
  open: boolean;
  /** True once the row has been opened at least once; keeps its panels (and their cache) alive while collapsed. */
  mounted: boolean;
  onToggle: () => void;
}) {
  const { period, thresholds, standardHoursPerDay: standardHours } = summary;
  const meta = STATUS_META[member.status];
  const noData = member.status === 'none' || member.status === 'unavailable';
  // Day: the day's hours. Week / Month: the average per available day.
  const hoursValue = period === 'day' ? member.hours : member.avgHoursPerDay;
  const detailId = `tu-detail-${member.id}`;

  return (
    <li className="tu-row" data-open={open}>
      <button
        type="button"
        className="tu-row-main"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="tu-who" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <StatusAvatar name={member.fullName} color={meta.color} size={36} />
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member.fullName}
            </b>
            <i style={{ fontStyle: 'normal', fontFamily: MONO, fontSize: 11, color: 'var(--txt-dim)' }}>{member.employeeCode}</i>
          </span>
        </span>

        <span className="tu-hours" style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--txt)' }}>
          {noData ? '—' : fmtHours(hoursValue)}
          {!noData && <small style={{ color: 'var(--txt-dim)', marginLeft: 4, fontSize: 11 }}>/ {fmtHours(standardHours)}</small>}
        </span>

        <span className="tu-meter">
          <UtilizationTrack pct={member.utilizationPct} status={member.status} thresholds={thresholds} />
        </span>

        <span className="tu-pct" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{
            fontFamily: MONO, fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums',
            color: member.status === 'none' || member.status === 'unavailable' ? 'var(--txt-dim)' : meta.color,
          }}>
            {member.status === 'unavailable' ? '—' : fmtPct(member.utilizationPct)}
          </span>
          {member.hasPendingApproval && (
            <span style={{ fontSize: 10.5, color: 'var(--txt-dim)', whiteSpace: 'nowrap', marginTop: 1 }}>Awaiting approval</span>
          )}
        </span>

        <span className="tu-status"><ColorPill color={meta.color} label={meta.label} /></span>

        <ChevronDown className="tu-chev" size={16} aria-hidden="true" style={{ color: 'var(--txt-dim)' }} />
      </button>

      <div id={detailId} className="tu-detail" role="region" aria-label={`${member.fullName} details`}>
        <div>
          <div className="tu-detail-in">
            {mounted && <MemberDetail member={member} summary={summary} today={today} />}
          </div>
        </div>
      </div>
    </li>
  );
}
