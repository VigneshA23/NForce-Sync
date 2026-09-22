import ProjectsUtilization from '../../pm/ProjectsUtilization';
import { ReporteeViewBanner } from '../../../components/ReporteeViewBanner';

/** Super Admin Reportee Views → Project Manager Views → Utilization. Reuses the PM's Projects
 *  Utilization page as-is (same useProjectDashboardSummary/useProjectDashboardFilters hooks,
 *  already org-wide for SUPERADMIN — see ProjectDashboardService.scopedProjects) — no separate
 *  utilization calculation exists or is introduced for Super Admin. */
export default function ReporteePmUtilization() {
  return (
    <div>
      <ReporteeViewBanner label="Project Manager Views: Utilization" />
      <ProjectsUtilization />
    </div>
  );
}
