import { useState } from 'react';
import LeadEodByEmployeeReport from './EodByEmployeeReport';
import LeadMissingEodReport from './MissingEodReport';

type Tab = 'eod' | 'missing';

export default function LeadReportsDashboard() {
  const [tab, setTab] = useState<Tab>('eod');

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Reports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>EOD exports and compliance — scoped to your direct reports</p>
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

      {tab === 'eod' && <LeadEodByEmployeeReport />}
      {tab === 'missing' && <LeadMissingEodReport />}
    </div>
  );
}
