import ReportsDashboard from '../../pm/ReportsDashboard';
import { ReporteeViewBanner } from '../../../components/ReporteeViewBanner';

/** Super Admin Reportee Views → Project Manager Views → EOD. Reuses the PM Reports page's
 *  "EOD by employee" tab (EodByEmployeeReportService already resolves SUPERADMIN to org-wide
 *  data) — this is the existing per-employee/day EOD listing PMs already see, not a new page. */
export default function ReporteePmEod() {
  return (
    <div>
      <ReporteeViewBanner label="Project Manager Views: EOD" />
      <ReportsDashboard initialTab="eod" />
    </div>
  );
}
