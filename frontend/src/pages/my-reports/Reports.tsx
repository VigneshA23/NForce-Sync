import ReportsDashboard from '../pm/ReportsDashboard';
import { RM_REPORT_SOURCE } from '../reports/eodReportSources';
import { NO_PROJECTS_ASSIGNED } from '../../lib/projectLabels';

/** My Reporting Team > Reports: the shared Reports screen on the reporting-manager data source — the EODs of the
 *  people who report directly to the viewer (see RM_REPORT_SOURCE). EOD by employee only; the backend decides
 *  who is in it, so this page carries no scope logic of its own. */
export default function MyReportsReports() {
  return (
    <ReportsDashboard
      source={RM_REPORT_SOURCE}
      noProjectLabel={NO_PROJECTS_ASSIGNED}
      title="Reports"
      subtitle="EOD reports for the people who report directly to you"
    />
  );
}
