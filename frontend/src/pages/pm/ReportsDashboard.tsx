import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EodByEmployeeReport from './EodByEmployeeReport';
import MissingEodReport from './MissingEodReport';
import { PM_REPORT_SOURCE, type EodReportSource, type ReportTab } from '../reports/eodReportSources';

export type Tab = ReportTab;

const TAB_LABELS: Record<Tab, string> = { eod: 'EOD by employee', missing: 'Missing EOD' };

function isTab(v: string | null): v is Tab {
  return v === 'eod' || v === 'missing';
}

/**
 * The Reports screen for every audience. `source` says where the data comes from and which tabs exist
 * (see eodReportSources.ts); a source without a Missing EOD tab simply doesn't list it, so nothing here
 * is hidden by role. Defaults to the Project Manager source.
 */
export default function ReportsDashboard({ initialTab, title = 'Reports', subtitle = 'Employee-wise EOD exports and compliance, scoped to your projects', source = PM_REPORT_SOURCE, noProjectLabel }: {
  initialTab?: Tab;
  /** Page heading. The Super Admin route passes "EOD Reports"; the PM page keeps "Reports". */
  title?: string;
  subtitle?: string;
  source?: EodReportSource;
  /** Passed through to EOD by employee: shown instead of a dash where there is no project. */
  noProjectLabel?: string;
} = {}) {
  // `?tab=` lets a KPI tile elsewhere (e.g. Executive Dashboard's EOD Compliance/Missing EODs)
  // deep-link straight to a tab — falls back to the explicit prop, then 'eod'. A tab the source doesn't
  // offer falls back to its first tab.
  const [searchParams] = useSearchParams();
  const requested: Tab = initialTab ?? (isTab(searchParams.get('tab')) ? searchParams.get('tab') as Tab : 'eod');
  const [chosen, setTab] = useState<Tab>(requested);
  const tab: Tab = source.tabs.includes(chosen) ? chosen : source.tabs[0];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
      </div>

      {source.tabs.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {source.tabs.map(key => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '8px 15px', borderRadius: 20, border: `1px solid ${tab === key ? 'var(--brand)' : 'var(--line2)'}`,
              background: tab === key ? 'var(--brand)' : 'var(--raised2)', color: tab === key ? '#fff' : 'var(--txt-dim)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {tab === 'eod' && <EodByEmployeeReport source={source} noProjectLabel={noProjectLabel} />}
      {tab === 'missing' && <MissingEodReport />}
    </div>
  );
}
