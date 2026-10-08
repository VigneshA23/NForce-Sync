import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, ClipboardList, AlertTriangle, Gauge, TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, KpiCard, ClickableKpi } from '../../components/KpiCard';
import { KPI_GRID_STYLE } from '../../lib/kpiGrid';
import { GlobalLoader } from '../../components/GlobalLoader';
import { DateRangeFilter } from '../../components/DateRangeFilter';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { todayISO } from '../../lib/date';
import { resolvePreset } from '../../lib/dateRange';
import type { DateRange } from '../../lib/dateRange';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { toRole } from '../../api/auth';
import { describeAuditEvent, formatRelative, AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_LABELS } from '../../lib/auditLog';
import { Pagination } from '../../components/Pagination';
import type { AuditLogDto } from '../../api/admin';
import { getExecutiveDashboard } from '../../api/executive';
import type { ProjectAttentionDto, EmployeeUtilizationDto, ProjectAllocationDto } from '../../api/executive';

// ── Shared primitives (mirrors Admin Dashboard's own local copies) ────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>{children}</div>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>{children}</div>;
}

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;
}


// ── Users by Role bar ─────────────────────────────────────────────────────────

function RoleBar({ roleKey, count, total }: { roleKey: string; count: number; total: number }) {
  const frontendRole = toRole(roleKey);
  const label = ROLE_LABELS[frontendRole] ?? roleKey;
  const color = ROLE_COLORS[frontendRole] ?? 'var(--txt-dim)';
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 90, fontSize: 11, color: 'var(--txt-mut)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ width: 28, fontSize: 11, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
        {count}
      </div>
    </div>
  );
}

// ── Donut with center label ────────────────────────────────────────────────────

function CenterDonut({ segments, centerValue, centerLabel }: {
  segments: { key: string; color: string; label: string; count: number }[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const data = segments.filter(s => s.count > 0).map(s => ({ name: s.label, value: s.count, color: s.color }));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ width: 130, height: 130, flexShrink: 0, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>{centerValue}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{centerLabel}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{s.label}</span>
            <span style={{ fontSize: 12, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
              {s.count} <span style={{ color: 'var(--txt-dim)' }}>({total > 0 ? Math.round((s.count / total) * 100) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Small employee-utilization list ───────────────────────────────────────────

const UTIL_PAGE_SIZE = 4;
// Room for 4 rows (name line + project subtitle ≈ 38px, plus the 8px row gap), so both cards keep the same
// height on every page, including a short last page.
const UTIL_LIST_HEIGHT = UTIL_PAGE_SIZE * 46;

function UtilList({ title, rows, accent }: { title: string; rows: EmployeeUtilizationDto[]; accent: string }) {
  const [page, setPage] = useState(0);
  // Reset to page 1 when the data changes (render-time reset, no effect).
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setPage(0);
  }
  const pages = Math.ceil(rows.length / UTIL_PAGE_SIZE);
  const pageSafe = Math.min(page, Math.max(pages - 1, 0));
  const slice = rows.slice(pageSafe * UTIL_PAGE_SIZE, (pageSafe + 1) * UTIL_PAGE_SIZE);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-mut)', marginBottom: 10 }}>{title}</div>
      <div style={{ minHeight: UTIL_LIST_HEIGHT }}>
        {rows.length === 0 ? <EmptyNote>No data for this period.</EmptyNote> : slice.map(r => (
          <div key={r.employeeId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fullName}</div>
              {r.primaryProject && <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{r.primaryProject}</div>}
            </div>
            <div style={{ fontSize: 12, color: accent, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {fmtPct(r.utilizationPct)}
            </div>
          </div>
        ))}
      </div>
      {rows.length > UTIL_PAGE_SIZE && (
        <Pagination
          page={pageSafe + 1} totalPages={pages} totalItems={rows.length} pageSize={UTIL_PAGE_SIZE}
          onPageChange={p => setPage(p - 1)} itemLabel="resources"
          style={{ padding: '10px 0 0', borderTop: 'none', marginTop: 2 }}
        />
      )}
    </div>
  );
}

// ── Recent Activity (client-side paged: the API returns a fixed latest 10) ─────

const ACTIVITY_PAGE_SIZE = 5;
// Room for 5 rows even when a message wraps to two lines (2 × 18px text + 12px gap = 48px per row, minus
// the last row's gap), so the card is the same height on every page, including a short last page.
const ACTIVITY_LIST_HEIGHT = ACTIVITY_PAGE_SIZE * 48 - 12;

function RecentActivityList({ events }: { events: AuditLogDto[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(events.length / ACTIVITY_PAGE_SIZE);
  const slice = events.slice(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE);

  return (
    <div>
      <div style={{ height: ACTIVITY_LIST_HEIGHT, overflowY: 'auto', paddingRight: 10 }}>
        {slice.map((event) => {
          const { message, category } = describeAuditEvent(event);
          const Icon = AUDIT_CATEGORY_ICONS[category];
          return (
            <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
              <div
                title={AUDIT_CATEGORY_LABELS[category]}
                aria-label={AUDIT_CATEGORY_LABELS[category]}
                style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, background: 'var(--raised2)', color: 'var(--txt-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}
              >
                <Icon size={13} aria-hidden="true" />
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>{message}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {formatRelative(event.occurredAt)}
              </div>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <Pagination
          page={page + 1} totalPages={pages} totalItems={events.length} pageSize={ACTIVITY_PAGE_SIZE}
          onPageChange={p => setPage(p - 1)} itemLabel="events"
          style={{ padding: '10px 0 0', borderTop: 'none', marginTop: 2 }}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  // DateRangeFilter only ever emits a complete, valid range, so there is no empty/error state here.
  const [range, setRange] = useState<DateRange>(() => resolvePreset('thisMonth'));
  const { from, to } = range;

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['executive', 'dashboard', from, to],
    queryFn: () => getExecutiveDashboard(from, to),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const insights = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    out.push(`EOD compliance is ${fmtPct(data.eodCompliance.compliancePct)} for the selected period, with ${data.eodCompliance.missing} missing submission(s) out of ${data.eodCompliance.expected} expected.`);
    out.push(`${data.projects.activeProjects} active project(s) are currently in progress out of ${data.projects.totalProjects} total.`);
    if (data.utilization.overallUtilizationPct !== null) {
      out.push(`Overall resource utilization is ${fmtPct(data.utilization.overallUtilizationPct)} for the selected period.`);
    }
    if (data.utilization.underutilizedCount > 0) {
      out.push(`${data.utilization.underutilizedCount} resource(s) are currently under-utilized (below ${fmtPct(data.utilization.underutilizedThresholdPct)}).`);
    }
    if (data.utilization.overloadedCount > 0) {
      out.push(`${data.utilization.overloadedCount} resource(s) are currently over-utilized (above ${fmtPct(data.utilization.overloadedThresholdPct)}).`);
    }
    if (data.allocation.resourcesWithNoActiveAllocation > 0) {
      out.push(`${data.allocation.resourcesWithNoActiveAllocation} employee(s) currently have no active project allocation.`);
    }
    if (data.projectsRequiringAttention.length > 0) {
      out.push(`${data.projectsRequiringAttention.length} project(s) currently require attention.`);
    }
    return out;
  }, [data]);

  return (
    <div>
      {/* Hero banner — always visible, even while the dashboard data below is still loading
          or failed to load (matches every other dashboard's behavior). */}
      <div style={{ marginBottom: 20 }}>
        <HeroBanner subtitle="Organization-wide operational overview." />
      </div>

      {/* Date filter */}
      {/* No horizontal padding: DateRangeFilter reuses the KPI row's grid, so its columns only line up
          with the tiles below if it spans the same width. The spinner is absolutely positioned so it
          never takes a grid column. */}
      <Card style={{ marginBottom: 24, padding: '14px 0', position: 'relative' }}>
        <DateRangeFilter value={range} onChange={setRange} maxDate={todayISO()} defaultPreset="thisMonth" />
        {isFetching && !isPending && (
          <RefreshCw size={14} className="nf-r-spin" style={{ color: 'var(--txt-dim)', position: 'absolute', top: 18, right: 10 }} />
        )}
      </Card>

      {isPending && (
        <GlobalLoader fullScreen={false} compact label="Loading dashboard..." />
      )}

      {isError && !isPending && (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load Executive Dashboard data.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      )}

      {data && (
        <>
          {/* KPI row — EOD / Utilization. Workforce (Total/Active/Inactive Users) and
              Projects (Total/Active/On Hold) tiles were dropped: those counts are already
              shown in the Workforce and Project Portfolio charts below, and this page is a
              CEO-facing summary that shouldn't repeat the same numbers as both a tile and a
              chart. */}
          <div className="nf-r-kpis" style={{ ...KPI_GRID_STYLE, marginBottom: 16 }}>
            <ClickableKpi onClick={() => navigate('/admin/reportee/pm/eod?tab=missing')}>
              <KpiCard icon={<ClipboardList size={18} />} label="EOD Compliance" value={fmtPct(data.eodCompliance.compliancePct)} accent="var(--info)" />
            </ClickableKpi>
            <ClickableKpi onClick={() => navigate('/admin/reportee/pm/eod?tab=missing')}>
              <KpiCard icon={<AlertTriangle size={18} />} label="Missing EODs" value={data.eodCompliance.missing} accent="var(--risk)" />
            </ClickableKpi>
            <ClickableKpi onClick={() => navigate('/admin/reportee/pm/utilization')}>
              <KpiCard icon={<Gauge size={18} />} label="Overall Utilization" value={fmtPct(data.utilization.overallUtilizationPct)} accent="var(--info)" />
            </ClickableKpi>
            <ClickableKpi onClick={() => navigate('/admin/reportee/pm/utilization?status=under')}>
              <KpiCard icon={<TrendingDown size={18} />} label="Under-utilized" value={data.utilization.underutilizedCount} accent="var(--warn)" />
            </ClickableKpi>
            <ClickableKpi onClick={() => navigate('/admin/reportee/pm/utilization?status=over')}>
              <KpiCard icon={<TrendingUp size={18} />} label="Over-utilized" value={data.utilization.overloadedCount} accent="var(--risk)" />
            </ClickableKpi>
            <ClickableKpi onClick={() => navigate(`/admin/unallocated-resources?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}>
              <KpiCard icon={<Users size={18} />} label="Unallocated Resources" value={data.allocation.resourcesWithNoActiveAllocation} accent="var(--txt-dim)" />
            </ClickableKpi>
          </div>

          {/* Workforce Overview / Project Portfolio */}
          <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
            <Card>
              <SectionTitle>Workforce: Users by Role</SectionTitle>
              {Object.entries(data.workforce.usersByRole).filter(([, v]) => v > 0).length === 0
                ? <EmptyNote>No data</EmptyNote>
                : Object.entries(data.workforce.usersByRole).filter(([, v]) => v > 0).map(([role, count]) => (
                  <RoleBar key={role} roleKey={role} count={count} total={data.workforce.totalUsers} />
                ))}
            </Card>
            <Card>
              <SectionTitle>Active vs Inactive Users</SectionTitle>
              <CenterDonut
                centerValue={String(data.workforce.totalUsers)}
                centerLabel="Total"
                segments={[
                  { key: 'active', color: 'var(--ok)', label: 'Active', count: data.workforce.activeUsers },
                  { key: 'inactive', color: 'var(--txt-dim)', label: 'Inactive', count: data.workforce.inactiveUsers },
                ]}
              />
            </Card>
          </div>

          {/* Project Portfolio */}
          <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
            <Card>
              <SectionTitle>Project Portfolio</SectionTitle>
              <CenterDonut
                centerValue={String(data.projects.totalProjects)}
                centerLabel="Projects"
                segments={[
                  { key: 'active', color: 'var(--ok)', label: 'Active', count: data.projects.activeProjects },
                  { key: 'on_hold', color: 'var(--warn)', label: 'On Hold', count: data.projects.onHoldProjects },
                  { key: 'completed', color: 'var(--info)', label: 'Completed', count: data.projects.completedProjects },
                  { key: 'inactive', color: 'var(--txt-dim)', label: 'Inactive', count: data.projects.inactiveProjects },
                ]}
              />
            </Card>
            <Card>
              <SectionTitle>Resource Allocation Overview</SectionTitle>
              <div style={{ display: 'flex', gap: 24, marginBottom: 18 }}>
                <div>
                  <div style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>{data.allocation.totalAllocatedResources}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Allocated resources</div>
                </div>
                <div>
                  <div style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt-dim)' }}>{data.allocation.resourcesWithNoActiveAllocation}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>No active allocation</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>By Project</div>
              {data.allocation.byProject.length === 0 ? <EmptyNote>No active allocations for this period.</EmptyNote> : (
                <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 10 }}>
                  {data.allocation.byProject.map((p: ProjectAllocationDto) => (
                    <div key={p.projectId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <span style={{ color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{p.projectName}</span>
                      <span style={{ color: 'var(--txt-mut)', flexShrink: 0, marginLeft: 10 }}>{p.allocatedResources} resources</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Utilization detail */}
          <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }}>
            <Card>
              <SectionTitle>Highest Utilized Resources</SectionTitle>
              <UtilList title="" rows={data.utilization.topUtilized} accent="var(--risk)" />
            </Card>
            <Card>
              <SectionTitle>Lowest Utilized Resources</SectionTitle>
              <UtilList title="" rows={data.utilization.bottomUtilized} accent="var(--warn)" />
            </Card>
          </div>

          {/* Projects Requiring Attention */}
          <Card style={{ marginBottom: 16 }}>
            <SectionTitle>Projects Requiring Attention</SectionTitle>
            {data.projectsRequiringAttention.length === 0 ? (
              <EmptyNote>No projects currently require attention.</EmptyNote>
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 448 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      {['Project', 'Project Manager', 'Status', 'Metric', 'Reason'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '6px 10px', color: 'var(--txt-dim)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                          // Stays visible while the capped table body scrolls past it.
                          position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.projectsRequiringAttention.map((p: ProjectAttentionDto) => (
                      <tr key={p.projectId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--txt)' }}>{p.projectName}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--txt-mut)' }}>{p.pmName ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--txt-mut)' }}>{p.status}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--txt-mut)' }}>{p.metric}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--txt-mut)' }}>{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Executive Insights / Recent Activity */}
          <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <Card>
              <SectionTitle>Executive Insights</SectionTitle>
              {insights.length === 0 ? <EmptyNote>No insights available for this period.</EmptyNote> : (
                <ul style={{ margin: 0, padding: '0 10px 0 18px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 180, overflowY: 'auto' }}>
                  {insights.map((line, i) => (
                    <li key={i} style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5 }}>{line}</li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <SectionTitle>Recent Activity</SectionTitle>
              {data.recentActivity.length === 0 ? <EmptyNote>No recent activity</EmptyNote> : (
                // Keyed on the event ids so fresh data (e.g. after a date-range change) resets to page 1.
                <RecentActivityList key={data.recentActivity.map(e => e.id).join(',')} events={data.recentActivity} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
