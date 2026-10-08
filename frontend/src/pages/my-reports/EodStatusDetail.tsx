import axios from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, FileX2, Plane } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { EodReportView } from '../../components/EodReportView';
import { useMyReportsMemberEod, type MemberEodEmptyState } from '../../api/myReports';
import { todayISO, formatDateShort } from '../../lib/date';
import { STATUS_CFG } from './eodStatusConfig';
import { StatusPill, StatusAvatar } from './eodStatusUi';
import { parseEodStatusView, eodStatusViewQuery } from './eodStatusView';

const EMPTY_STATES: Record<MemberEodEmptyState, { Icon: typeof FileX2; color: string; title: string; body: (name: string, date: string) => string }> = {
  MISSING: {
    Icon: FileX2, color: 'var(--risk)',
    title: 'No EOD report submitted',
    body: (name, date) => `${name} did not submit an EOD report for ${date}.`,
  },
  NOT_SUBMITTED: {
    Icon: Clock, color: 'var(--warn)',
    title: 'Not submitted yet',
    body: (name, date) => `${name} has not submitted an EOD report for ${date}. Drafts are not visible until they are submitted.`,
  },
  ON_LEAVE: {
    Icon: Plane, color: 'var(--info)',
    title: 'On leave',
    body: (name, date) => `${name} is on leave or it is a company holiday on ${date}, so there is no EOD report to show.`,
  },
};

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 403) return "You don't have access to this employee's EOD report. It is only available for people in your reporting team.";
    if (err.response?.status === 404) return 'This employee could not be found.';
    if (err.response?.status === 400) return 'That date is not valid for an EOD report.';
  }
  return 'Failed to load this EOD report.';
}

export default function MyReportsEodStatusDetail() {
  const { employeeId: employeeIdParam } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();

  const today = todayISO();
  const view = parseEodStatusView(searchParams, today);
  const date = view.date;
  const employeeId = Number(employeeIdParam);
  const idValid = Number.isInteger(employeeId) && employeeId > 0;

  const { data, isPending, isError, error, refetch } = useMyReportsMemberEod(employeeId, date, idValid);

  // Back rebuilds the list's view (date + search + status filter) from the query string the list
  // handed us. It's all in this page's URL, so it also survives a refresh here.
  const backTo = `/my-reports/eod-status?${eodStatusViewQuery(view)}`;
  const dateLabel = formatDateShort(date);

  return (
    <div>
      <Link
        to={backTo}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: '6px 10px 6px 8px',
          fontSize: 12.5, fontWeight: 600, color: 'var(--txt-mut)', textDecoration: 'none',
          border: '1px solid var(--line)', borderRadius: 8, background: 'var(--raised)',
        }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to Team EOD Status
      </Link>

      {!idValid ? (
        <Card style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--risk)', fontSize: 13 }}>
          Invalid employee.
        </Card>
      ) : isPending ? (
        <div aria-busy="true">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 11, width: 280, borderRadius: 4 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 320, borderRadius: 10 }} />
        </div>
      ) : isError || !data ? (
        <Card style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>{errorMessage(error)}</div>
          {!(axios.isAxiosError(error) && error.response && error.response.status < 500) && (
            <button
              onClick={() => refetch()}
              style={{ padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
            >
              Retry
            </button>
          )}
        </Card>
      ) : (
        <>
          {/* Employee header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatusAvatar name={data.fullName} color={STATUS_CFG[data.status].color} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
                {data.fullName}
              </h1>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{data.employeeCode}</span>
                {data.email && <><span aria-hidden="true">·</span><span>{data.email}</span></>}
                <span aria-hidden="true">·</span>
                <span>EOD for {dateLabel}</span>
              </div>
            </div>
            <StatusPill status={data.status} />
          </div>

          {data.status === 'ON_LEAVE' && data.entry && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 8,
              fontSize: 12.5, color: 'var(--info)',
              background: 'color-mix(in srgb, var(--info) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--info) 28%, transparent)',
            }}>
              <Plane size={14} aria-hidden="true" />
              On leave on {dateLabel} — leave details below.
            </div>
          )}

          {data.entry ? (
            <EodReportView entry={data.entry} />
          ) : (
            (() => {
              const cfg = EMPTY_STATES[data.emptyState ?? 'MISSING'];
              return (
                <Card style={{ padding: '56px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: cfg.color,
                    background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
                  }}>
                    <cfg.Icon size={24} aria-hidden="true" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>{cfg.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--txt-dim)', maxWidth: 420, margin: '0 auto' }}>
                    {cfg.body(data.fullName, dateLabel)}
                  </div>
                </Card>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}
