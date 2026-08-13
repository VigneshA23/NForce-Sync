import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { extractApiError } from '../../api/admin';
import { useMyEmployeeProjects, useEmployeeProjectDetail } from '../../api/employeeProjects';
import {
  detailLabelStyle, detailValueStyle, StatusBadge, ErrorBanner, fmtDateDMY, ProjectsPanel,
} from '../../components/projects/MyProjectsShared';

// ── Project details modal ───────────────────────────────────────────────────────
// Deliberately omits the Team Lead version's "Assigned Employees" roster — an Employee has no
// business need to see who else is staffed on their project, and the backend never sends it.

function ProjectDetailsModal({ projectId, onClose }: { projectId: number | null; onClose: () => void }) {
  const { data, isPending, isError } = useEmployeeProjectDetail(projectId);

  return (
    <Modal open={projectId != null} title={data ? data.name : 'Project Details'} onClose={onClose} width={480}>
      {isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 18, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && <ErrorBanner message="Failed to load project details." />}

      {data && (
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 1fr',
          rowGap: 10, columnGap: 12,
        }}>
          <span style={detailLabelStyle}>Project Name</span>
          <span style={{ ...detailValueStyle, fontWeight: 500 }}>{data.name}</span>

          <span style={detailLabelStyle}>Client</span>
          <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>{data.client ?? 'Internal'}</span>

          <span style={detailLabelStyle}>Status</span>
          <span><StatusBadge status={data.status} /></span>

          <span style={detailLabelStyle}>Start Date</span>
          <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>{fmtDateDMY(data.startDate)}</span>

          <span style={detailLabelStyle}>End Date</span>
          <span style={{ ...detailValueStyle, color: 'var(--txt-mut)' }}>
            {data.endDate ? fmtDateDMY(data.endDate) : 'Ongoing'}
          </span>
        </div>
      )}
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyProjects() {
  const { data: projects, isPending, isError, isFetching, refetch } = useMyEmployeeProjects();
  const { showToast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [detailsProjectId, setDetailsProjectId] = useState<number | null>(null);

  const list = useMemo(() => projects ?? [], [projects]);

  // Background refetch only — the initial load already renders its own skeleton via isPending,
  // so this only covers the icon-spin/disabled state on the Refresh button.
  const isRefreshing = !isPending && isFetching;

  async function handleRefresh() {
    if (isRefreshing) return;
    const result = await refetch();
    if (result.isError) {
      showToast('error', extractApiError(result.error, 'Failed to refresh projects'));
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          My Projects
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          View and track the projects assigned to you.
        </p>
      </div>

      <ProjectsPanel
        projects={list}
        isPending={isPending}
        isError={isError}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
        onOpenDetails={setDetailsProjectId}
        boldNameLink
        compactToolbar
        statusAsDropdown
      />

      <ProjectDetailsModal
        projectId={detailsProjectId}
        onClose={() => setDetailsProjectId(null)}
      />
    </div>
  );
}
