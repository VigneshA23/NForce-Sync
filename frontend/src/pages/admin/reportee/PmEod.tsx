import ReportsDashboard from '../../pm/ReportsDashboard';

/** Super Admin Reportee Views → Project Manager Views → EOD. Reuses the PM Reports page's
 *  "EOD by employee" tab (EodByEmployeeReportService already resolves SUPERADMIN to org-wide
 *  data) — this is the existing per-employee/day EOD listing PMs already see, not a new page. */
export default function ReporteePmEod() {
  return (
    <div>
      <ReportsDashboard
        initialTab="eod"
        title="EOD Reports"
        subtitle="Employee-wise EOD exports and compliance across all projects"
      />
    </div>
  );
}
