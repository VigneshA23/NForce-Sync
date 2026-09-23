import ProjectsAllocation from '../../pm/ProjectsAllocation';
import { ReporteeViewBanner } from '../../../components/ReporteeViewBanner';

/** Super Admin Reportee Views → Project Manager Views → Projects & Allocation. Reuses the PM's
 *  own Projects & Allocation page as-is (already org-wide for SUPERADMIN via GET /api/projects/
 *  all and GET /api/allocations), read-only — a single nav entry for both of the page's own
 *  internal Projects/Allocation tabs, matching PM's own single "Projects & Allocation" nav item. */
export default function ReporteePmProjects() {
  return (
    <div>
      <ReporteeViewBanner label="Project Manager Views: Projects & Allocation" />
      <ProjectsAllocation readOnly />
    </div>
  );
}
