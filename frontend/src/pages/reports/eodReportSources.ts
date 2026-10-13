import type { UseQueryResult } from '@tanstack/react-query';
import {
  exportEodByEmployee, useEodByEmployeeReport,
  type EodByEmployeeExportParams, type EodByEmployeeFilterParams, type EodByEmployeeReportDto,
} from '../../api/reports';
import { useProjectDashboardFilters, type ProjectDashboardFiltersDto } from '../../api/projectDashboard';
import { exportRmEodByEmployee, useRmEodByEmployeeReport, useRmReportFilters } from '../../api/myReports';

/** The tabs a Reports page can offer. A source lists the ones it supports — no role checks decide this. */
export type ReportTab = 'eod' | 'missing';

/**
 * Where a Reports page gets its data and what it says. The Reports screen (ReportsDashboard and its tabs) is
 * the same for every audience; each source supplies its endpoint, its dropdown options, its wording, and which
 * tabs exist. Who may see which rows is decided by the backend endpoint behind `useReport` — never here.
 */
export interface EodReportSource {
  /** Tabs this source offers, in order. A source without 'missing' simply has no Missing EOD tab. */
  tabs: ReportTab[];
  useReport: (filters: EodByEmployeeFilterParams, enabled: boolean) => UseQueryResult<EodByEmployeeReportDto>;
  exportReport: (params: EodByEmployeeExportParams) => Promise<void>;
  /** Client / Project / Team Lead dropdown options. `teams` is empty for a source with no Team Lead filter. */
  useFilterOptions: () => Pick<ProjectDashboardFiltersDto, 'projects' | 'clients' | 'teams'> | undefined;
  /** Whether the Team Lead dropdown is offered at all. */
  showTeamLeadFilter: boolean;
  /** Footnote under the report. */
  scopeNote: string;
  /** Overrides the empty-list wording when the current filters return no rows; the page's own wording applies when unset. */
  emptyMessage?: string;
}

/** Project Manager's own Reports and the Super Admin "EOD Reports" page (employees on the caller's projects). */
export const PM_REPORT_SOURCE: EodReportSource = {
  tabs: ['eod', 'missing'],
  useReport: useEodByEmployeeReport,
  exportReport: exportEodByEmployee,
  useFilterOptions: () => useProjectDashboardFilters().data,
  showTeamLeadFilter: true,
  scopeNote: 'Scoped to the employees allocated to your projects in this date range.',
};

/** My Reporting Team > Reports: the people who report directly to the caller. EOD by employee only. */
export const RM_REPORT_SOURCE: EodReportSource = {
  tabs: ['eod'],
  useReport: useRmEodByEmployeeReport,
  exportReport: exportRmEodByEmployee,
  useFilterOptions: () => {
    const { data } = useRmReportFilters();
    return data ? { projects: data.projects, clients: data.clients, teams: [] } : undefined;
  },
  showTeamLeadFilter: false,
  scopeNote: 'Scoped to the people who report directly to you, using the reporting manager they had when each EOD was submitted.',
  emptyMessage: 'No reports found for your team in this date range.',
};
