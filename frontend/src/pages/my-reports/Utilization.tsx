import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarOff } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { extractError } from '../approvals/shared';
import { useTeamUtilizationSummary, type UtilizationPeriod, type UtilizationStatus } from '../../api/teamUtilization';
import { todayISO, yesterdayISO } from '../../lib/date';
import { EmptyState } from './teamUtilization/EmptyState';
import { MembersBoard } from './teamUtilization/MembersBoard';
import { OverviewSection } from './teamUtilization/OverviewSection';
import {
  countedMembers, fmtDay, periodCaption, type SortKey, type StatusFilter,
} from './teamUtilization/utilizationLogic';
import { parseUtilizationView, utilizationViewQuery, type UtilizationView } from './teamUtilization/utilizationView';

// The Day tab was removed from the UI. The API (and the Day paths in the row panels) still support it.
const PERIOD_LABEL: Partial<Record<UtilizationPeriod, string>> = { week: 'Week', month: 'Month' };

// Hover / focus / responsive rules need real selectors, so they live in one scoped block (the same
// approach EOD Status uses). Every colour is a design token.
const STYLES = `
.tu-overview{display:grid;grid-template-columns:330px 1fr;gap:16px;margin-bottom:16px}
.tu-legend{display:grid;grid-template-columns:repeat(4,1fr);margin-top:auto;border-top:1px solid var(--line);padding-top:6px}
.tu-tile{text-align:left;padding:14px 14px 12px;border-radius:10px;position:relative;background:none;border:0;cursor:pointer;font:inherit;color:inherit;transition:background .15s}
.tu-tile:not(:first-child)::before{content:"";position:absolute;left:0;top:16px;bottom:14px;width:1px;background:var(--line)}
.tu-tile:hover{background:var(--raised)}
.tu-tile[aria-pressed="true"]{background:color-mix(in srgb,var(--info) 14%,var(--panel));box-shadow:inset 0 0 0 1px var(--info)}
.tu-tile:focus-visible,.tu-chip:focus-visible,.tu-row-main:focus-visible,.tu-seg button:focus-visible,.tu-sort:focus-visible,.tu-clear:focus-visible{outline:2px solid var(--info);outline-offset:2px}
.tu-stack-seg{transition:flex-grow .4s cubic-bezier(.2,.8,.2,1)}
.tu-gauge-value{transition:stroke-dasharray .5s cubic-bezier(.2,.8,.2,1),stroke .3s}
.tu-toolbar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid var(--line)}
.tu-search{display:flex;align-items:center;gap:8px;background:var(--shell);border:1px solid var(--line);border-radius:9px;padding:0 12px;height:36px;min-width:230px}
.tu-search input{background:none;border:0;color:var(--txt);font:inherit;width:100%;outline:none}
.tu-search:focus-within{border-color:var(--info)}
.tu-clear{background:none;border:0;color:var(--txt-dim);cursor:pointer;display:flex;padding:2px;border-radius:4px}
.tu-chips{display:flex;gap:6px;flex-wrap:wrap}
.tu-chip{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:none;color:var(--txt-mut);font:inherit;font-weight:500;font-size:12.5px;cursor:pointer}
.tu-chip:hover{color:var(--txt);background:var(--raised)}
.tu-chip[aria-pressed="true"]{background:color-mix(in srgb,var(--info) 18%,transparent);border-color:var(--info);color:var(--txt)}
.tu-chip em{font-style:normal;font-family:"JetBrains Mono",monospace;font-size:11.5px;opacity:.75}
.tu-sort{background:var(--shell);border:1px solid var(--line);border-radius:9px;color:var(--txt);font:inherit;height:36px;padding:0 10px}
.tu-lhead,.tu-row-main{display:grid;grid-template-columns:minmax(210px,1.25fr) 84px minmax(180px,2fr) 120px 150px 22px;align-items:center;gap:16px;padding:0 20px}
.tu-lhead{height:38px;color:var(--txt-dim);font-size:12px;font-weight:500;border-bottom:1px solid var(--line)}
.tu-ticks{position:relative;display:block;height:100%}
.tu-ticks span{position:absolute;top:50%;transform:translate(-50%,-50%);font-family:"JetBrains Mono",monospace;font-size:11px}
.tu-row{border-bottom:1px solid var(--line)}
.tu-row:last-child{border-bottom:0}
.tu-row-main{width:100%;min-height:64px;text-align:left;background:none;border:0;color:inherit;font:inherit;cursor:pointer;transition:background .15s}
.tu-row-main:hover,.tu-row[data-open="true"] .tu-row-main{background:var(--raised)}
.tu-chev{transition:transform .2s}
.tu-row[data-open="true"] .tu-chev{transform:rotate(180deg)}
.tu-fill{transition:width .5s cubic-bezier(.2,.8,.2,1)}
.tu-detail{display:grid;grid-template-rows:0fr;visibility:hidden;transition:grid-template-rows .25s ease,visibility 0s linear .25s}
.tu-row[data-open="true"] .tu-detail{grid-template-rows:1fr;visibility:visible;transition:grid-template-rows .25s ease,visibility 0s}
.tu-detail>div{overflow:hidden}
.tu-detail-in{padding:6px 20px 22px 68px}
.tu-detail-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:20px;align-items:stretch}
.tu-panel{background:var(--shell);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0;display:flex;flex-direction:column}
.tu-panel-body{flex:1;display:flex;flex-direction:column;min-height:0}
.tu-total{margin-top:auto}
.tu-bars{display:flex;align-items:flex-end;gap:8px}
.tu-day{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:4px 2px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;cursor:pointer}
.tu-day:hover:not(:disabled){background:var(--raised)}
.tu-day:disabled{cursor:not-allowed}
.tu-cal{max-width:300px;margin:0 auto}
.tu-calgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.tu-calhead{text-align:center;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--txt-dim);padding-bottom:2px}
.tu-cell{height:36px;border-radius:7px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;font:inherit;cursor:pointer;transition:filter .12s,transform .12s}
.tu-cell-num{font-size:12px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.tu-cell-sub{font-family:"JetBrains Mono",monospace;font-size:8.5px;font-weight:600;line-height:1;opacity:.9}
.tu-cell:hover:not(:disabled){filter:brightness(1.18);transform:translateY(-1px)}
.tu-cell:disabled{cursor:default}
.tu-callegend{display:flex;gap:6px 12px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:var(--txt);font-weight:500}
.tu-day[aria-pressed="true"]{background:color-mix(in srgb,var(--info) 14%,transparent);box-shadow:inset 0 0 0 2px var(--info)}
.tu-cell[aria-pressed="true"]{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--info)}
.tu-day:focus-visible,.tu-cell:focus-visible,.tu-retry:focus-visible{outline:2px solid var(--info);outline-offset:2px}
.tu-retry{padding:6px 14px;background:var(--raised2);border:1px solid var(--line2);border-radius:6px;color:var(--txt);font:inherit;font-size:12.5px;cursor:pointer}
.tu-seg{display:flex;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:3px}
.tu-seg button{padding:6px 14px;border-radius:6px;border:0;background:none;color:var(--txt-mut);font:inherit;font-weight:500;font-size:13px;cursor:pointer}
.tu-seg button:hover{color:var(--txt)}
.tu-seg button[aria-pressed="true"]{background:var(--info);color:#fff}
@media (max-width:1100px){.tu-overview{grid-template-columns:1fr}.tu-gauge-card{flex-direction:row!important;justify-content:center;gap:30px}}
@media (max-width:900px){.tu-legend{grid-template-columns:repeat(2,1fr)}.tu-tile:nth-child(3)::before{display:none}.tu-detail-in{padding-left:20px}.tu-detail-grid{grid-template-columns:1fr}.tu-picker{order:-1}}
@media (max-width:760px){.tu-lhead{display:none}.tu-row-main{grid-template-columns:1fr auto 20px;gap:8px 12px;padding:14px 16px}.tu-hours,.tu-status{display:none}.tu-meter{grid-column:1/-1;grid-row:2}.tu-gauge-card{flex-direction:column!important;gap:0}.tu-search{min-width:0;flex:1}}
@media (prefers-reduced-motion:reduce){.tu-stack-seg,.tu-gauge-value,.tu-fill,.tu-detail,.tu-chev,.tu-tile,.tu-row-main,.tu-cell{transition:none!important}.tu-cell:hover:not(:disabled){transform:none}}
`;

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading utilization">
      <div className="tu-overview">
        <Card style={{ padding: '22px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="skeleton" style={{ width: 210, height: 210, borderRadius: '50%' }} />
        </Card>
        <Card style={{ padding: '24px 26px' }}>
          <div className="skeleton" style={{ height: 22, width: '55%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 13, width: '75%', marginBottom: 26 }} />
          <div className="skeleton" style={{ height: 14, width: '100%', borderRadius: 7, marginBottom: 22 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 10 }} />)}
          </div>
        </Card>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="skeleton" style={{ height: 68, borderRadius: 0 }} />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 13, width: '30%', marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 8, width: '70%', borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function MyReportsUtilization() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseUtilizationView(searchParams);

  const today = todayISO();
  const { data, isPending, isError, error, refetch } = useTeamUtilizationSummary(view.period, today);

  function update(patch: Partial<UtilizationView>) {
    setSearchParams(utilizationViewQuery({ ...view, ...patch }), { replace: true });
  }

  const caption = data ? periodCaption(data, yesterdayISO()) : null;
  const counted = data ? countedMembers(data.counts) : 0;
  const showBanner = !!data && !data.noCompletedDays && data.period === 'day' && data.counts.none > 0 && !!data.to;

  return (
    <div>
      <style>{STYLES}</style>

      {/* Header — only the Day / Week / Month control; no arrows, export or period box. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 26, fontWeight: 650, letterSpacing: '-0.4px', color: 'var(--txt)', margin: 0 }}>
            Team Utilization
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--txt-mut)', fontSize: 14 }}>
            See who has capacity, who is stretched, and who still needs to log hours.
          </p>
          {caption && (
            <p style={{ margin: '6px 0 0', color: 'var(--txt-dim)', fontSize: 12.5 }} aria-live="polite">{caption}</p>
          )}
        </div>
        <div className="tu-seg" role="group" aria-label="Time range">
          {(Object.keys(PERIOD_LABEL) as UtilizationPeriod[]).map(p => (
            <button key={p} type="button" aria-pressed={view.period === p} onClick={() => update({ period: p })}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <Skeleton />
      ) : isError || !data ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }} role="alert">
            Failed to load utilization data. {extractError(error)}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{ padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </Card>
      ) : data.noCompletedDays ? (
        <EmptyState
          Icon={CalendarOff}
          title="No completed days yet this month."
          body="Utilization appears once the first working day of the month has finished."
        />
      ) : (
        <>
          {showBanner && data.to && (
            <div
              role="status"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, padding: '12px 16px', borderRadius: 12,
                background: 'color-mix(in srgb, var(--warn) 12%, var(--panel))',
                border: '1px solid color-mix(in srgb, var(--warn) 28%, var(--line))',
              }}
            >
              <AlertTriangle size={18} aria-hidden="true" style={{ color: 'var(--warn)', flexShrink: 0 }} />
              <p style={{ margin: 0, color: 'var(--txt)', fontSize: 13.5 }}>
                <b>{data.counts.none} of {counted} members</b> haven't logged hours for {fmtDay(data.to)}.
                Their 0% is counted in the average.
              </p>
            </div>
          )}

          <OverviewSection
            summary={data}
            filter={view.filter}
            onToggleFilter={(s: UtilizationStatus) => update({ filter: view.filter === s ? null : s })}
          />

          {/* Keyed by period so switching tab collapses any open row and resets "show all". */}
          <MembersBoard
            key={data.period}
            summary={data}
            filter={view.filter}
            query={view.q}
            sort={view.sort}
            onFilter={(f: StatusFilter) => update({ filter: f })}
            onQuery={(q: string) => update({ q })}
            onSort={(s: SortKey) => update({ sort: s })}
          />
        </>
      )}
    </div>
  );
}
