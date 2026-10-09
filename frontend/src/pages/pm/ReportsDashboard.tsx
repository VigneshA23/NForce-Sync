import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EodByEmployeeReport from './EodByEmployeeReport';
import MissingEodReport from './MissingEodReport';

export type Tab = 'eod' | 'missing';

function isTab(v: string | null): v is Tab {
  return v === 'eod' || v === 'missing';
}

export default function ReportsDashboard({ initialTab, title = 'Reports', subtitle = 'Employee-wise EOD exports and compliance, scoped to your projects', defaultToCurrentMonth = false }: {
  initialTab?: Tab;
  /** Opt-in: both tabs start on the current month up to today (Super Admin EOD Reports only). */
  defaultToCurrentMonth?: boolean;
  /** Page heading. The Super Admin route passes "EOD Reports"; the PM page keeps "Reports". */
  title?: string;
  subtitle?: string;
} = {}) {
  // `?tab=` lets a KPI tile elsewhere (e.g. Executive Dashboard's EOD Compliance/Missing EODs)
  // deep-link straight to a tab — falls back to the explicit prop, then 'eod'.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab ?? (isTab(searchParams.get('tab')) ? searchParams.get('tab') as Tab : 'eod'));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['eod', 'EOD by employee'],
          ['missing', 'Missing EOD'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 15px', borderRadius: 20, border: `1px solid ${tab === key ? 'var(--brand)' : 'var(--line2)'}`,
            background: tab === key ? 'var(--brand)' : 'var(--raised2)', color: tab === key ? '#fff' : 'var(--txt-dim)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'eod' && <EodByEmployeeReport defaultToCurrentMonth={defaultToCurrentMonth} />}
      {tab === 'missing' && <MissingEodReport defaultToCurrentMonth={defaultToCurrentMonth} />}
    </div>
  );
}
