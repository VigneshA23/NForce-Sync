import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { toLocalISODate, todayISO as localTodayISO, formatDate } from '../../lib/date';
import { useTeamUtil } from '../../api/utilization';
import { utilState, utilColor, isWorkingDay } from '../../lib/rules';
import { UtilBar, UtilLegend } from '../../components/UtilBar';
import type { TeamUtilDto } from '../../api/utilization';

// ── helpers ────────────────────────────────────────────────────────────────────

const toISO = toLocalISODate;

// Weekday is genuinely useful context here (day-by-day navigation header) — kept
// alongside the standard DD-MM-YYYY date, rather than the old locale-verbose form.
function fmtDisplayDate(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
  return `${weekday}, ${formatDate(iso)}`;
}

function prevWorkingDay(iso: string): string {
  const d = new Date(iso);
  do { d.setDate(d.getDate() - 1); } while (!isWorkingDay(d));
  return toISO(d);
}

function nextWorkingDay(iso: string): string {
  const d = new Date(iso);
  do { d.setDate(d.getDate() + 1); } while (!isWorkingDay(d));
  return toISO(d);
}

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

// ── distribution summary ───────────────────────────────────────────────────────

function Distribution({ members }: { members: TeamUtilDto[] }) {
  const counts = members.reduce(
    (acc, m) => {
      const s = utilState(m.snapshot?.utilizationPct ?? null);
      acc[s]++;
      return acc;
    },
    { healthy: 0, under: 0, over: 0, na: 0 } as Record<string, number>,
  );

  const items = [
    { key: 'healthy', color: 'var(--ok)',      label: 'Healthy' },
    { key: 'under',   color: 'var(--warn)',    label: 'Under' },
    { key: 'over',    color: 'var(--risk)',    label: 'Over' },
    { key: 'na',      color: 'var(--txt-dim)', label: 'N/A' },
  ].filter(i => counts[i.key] > 0);

  if (items.length === 0) return null;

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 16, fontSize: 12 }}>
      {items.map(({ key, color, label }) => (
        <span key={key} style={{ color }}>
          <strong style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {counts[key]}
          </strong>{' '}
          <span style={{ color: 'var(--txt-mut)' }}>{label}</span>
        </span>
      ))}
    </div>
  );
}

// ── member util row ────────────────────────────────────────────────────────────

function MemberUtilRow({ member, isLast }: { member: TeamUtilDto; isLast: boolean }) {
  const pct   = member.snapshot?.utilizationPct ?? null;
  const color = utilColor(pct);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '200px 1fr 70px 120px', gap: 16,
      alignItems: 'center', padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--line)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.employeeName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
          {member.employeeCode}
        </div>
      </div>
      <UtilBar pct={pct} />
      <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color, textAlign: 'right' }}>
        {member.snapshot
          ? `${member.snapshot.approvedProductiveHours}/${member.snapshot.availableHours}h`
          : '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)', textAlign: 'right' }}>
        {!member.snapshot
          ? 'No snapshot'
          : member.snapshot.availableHours === 0
          ? 'Non-working day'
          : null}
      </div>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function TeamUtilization() {
  const { user } = useAuth();
  const todayISO = localTodayISO();
  const [dateISO, setDateISO] = useState(todayISO);

  const { data: members, isPending, isError, refetch } = useTeamUtil(user?.id, dateISO);

  const isToday    = dateISO === todayISO;
  const isWeekend  = !isWorkingDay(new Date(dateISO + 'T12:00:00')); // noon to avoid TZ edge

  if (isPending) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
          <div><Skel h={24} w={180} /><div style={{ marginTop: 8 }}><Skel h={14} w={140} /></div></div>
          <Skel h={36} w={240} />
        </div>
        <Card>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '200px 1fr 70px 120px', gap: 16 }}>
              <div><Skel h={13} w="80%" /><div style={{ marginTop: 4 }}><Skel h={11} w="40%" /></div></div>
              <Skel h={6} />
              <Skel h={11} w="80%" />
              <Skel h={11} w="60%" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Utilization</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load utilization data.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Team Utilization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Only APPROVED hours count · snapshots written at approval time
          </p>
        </div>

        {/* Date navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setDateISO(prevWorkingDay(dateISO))}
            aria-label="Previous working day"
            style={{ padding: '8px 12px', border: 'none', background: 'none', color: 'var(--txt-mut)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--txt)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--txt-mut)')}
          >
            <ChevronLeft size={14} />
          </button>
          <div style={{
            padding: '8px 12px', fontSize: 12, color: 'var(--txt)',
            fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap',
            borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)',
          }}>
            {fmtDisplayDate(dateISO)}
            {isToday && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--info)' }}>Today</span>}
          </div>
          <button
            onClick={() => !isToday && setDateISO(nextWorkingDay(dateISO))}
            disabled={isToday}
            aria-label="Next working day"
            style={{ padding: '8px 12px', border: 'none', background: 'none', color: isToday ? 'var(--txt-dim)' : 'var(--txt-mut)', cursor: isToday ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (!isToday) e.currentTarget.style.color = 'var(--txt)'; }}
            onMouseLeave={e => { if (!isToday) e.currentTarget.style.color = 'var(--txt-mut)'; }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {isWeekend ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>Not a working day</div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No utilization data is computed for weekends.</div>
        </Card>
      ) : members!.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>No team members</div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No one reports to you yet.</div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Distribution summary */}
          <Distribution members={members!} />

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 70px 120px', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Member</span>
            <span>Utilization</span>
            <span style={{ textAlign: 'right' }}>Approved/Avail</span>
            <span />
          </div>

          {/* Member rows */}
          {members!.map((m, i) => (
            <MemberUtilRow key={m.employeeId} member={m} isLast={i === members!.length - 1} />
          ))}

          {/* Legend */}
          <UtilLegend />
        </Card>
      )}
    </div>
  );
}
