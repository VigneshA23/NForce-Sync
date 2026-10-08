import ProjectsUtilization from '../../pm/ProjectsUtilization';

/** Super Admin Reportee Views → Project Manager Views → Utilization. Reuses the PM's Projects
 *  Utilization page as-is (same useProjectDashboardSummary/useProjectDashboardFilters hooks,
 *  already org-wide for SUPERADMIN — see ProjectDashboardService.scopedProjects) — no separate
 *  utilization calculation exists or is introduced for Super Admin. */
export default function ReporteePmUtilization() {
  return (
    <div>
      <ProjectsUtilization />
    </div>
  );
}
