import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface TodayStatusDto {
  status: string;
  submittedAt: string | null;
  remarks: string | null;
}

export interface PendingCorrectionDto {
  entryId: number;
  entryDate: string;
  status: string;
  reviewerComment: string | null;
  updatedAt: string;
}

export interface EmployeeDashboardStatsDto {
  todayStatus: TodayStatusDto;
  pendingCorrections: PendingCorrectionDto[];
  missedDates: string[];
  missedCount: number;
}

export interface EmployeeProjectDto {
  projectId: number;
  projectCode: string;
  projectName: string;
  pmName: string | null;
  projectStatus: string;
  assignedFrom: string;
  assignedTo: string | null;
}

export interface HolidayDto {
  id: number;
  name: string;
  holidayDate: string;
}

export function useEmployeeDashboardStats(employeeId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'dashboard-stats', employeeId],
    queryFn: () =>
      api.get<EmployeeDashboardStatsDto>(`/employee/${employeeId}/dashboard-stats`).then(r => r.data),
    enabled: employeeId != null,
    refetchInterval: 60_000,
  });
}

export function useMyProjects(employeeId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'projects', employeeId],
    queryFn: () =>
      api.get<EmployeeProjectDto[]>(`/employee/${employeeId}/projects`).then(r => r.data),
    enabled: employeeId != null,
  });
}

export function useUpcomingHolidays() {
  return useQuery({
    queryKey: ['employee', 'holidays', 'upcoming'],
    queryFn: () =>
      api.get<HolidayDto[]>('/employee/holidays/upcoming').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
}
