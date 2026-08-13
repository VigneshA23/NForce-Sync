import { api } from './client';

// ── Response types (mirror backend DTOs) ──────────────────────────────────────

export type WeekendRule = 'SAT_SUN' | 'SUN_ONLY';

export interface BusinessRuleConfigDto {
  workingHoursPerDay: number;
  weekendRule: WeekendRule;
  // No eodCutoffTime: the EOD deadline is per shift now — see ShiftDefinitionDto.eodCutoffHours.
  reminderLeadMinutes: number;
  escalationSlaHours: number;
  /** Time-adjustment uses permitted per calendar month, per type. Global — no overrides. */
  lateArrivalAllowance: number;
  earlyLeaveAllowance: number;
  interveningAllowance: number;
}

export interface ShiftDefinitionDto {
  id: number;
  name: string;
  startTime: string; // "HH:mm:ss"
  endTime: string;
  /** Hours after endTime the EOD is due, e.g. 3 on a 15:30-00:30 shift means 03:30.
   *  Null when no deadline is configured — no reminder is sent for that shift. */
  eodCutoffHours: number | null;
  active: boolean;
  // Best-effort — matched by name against a legacy `employee` table, not a live FK.
  // Purely informational, shown in the delete-confirmation dialog.
  assignedEmployeeCount: number;
}

export interface HolidayDto {
  id: number;
  name: string;
  holidayDate: string; // "yyyy-MM-dd"
}

// ── Config ──────────────────────────────────────────────────────────────────

export async function getBusinessRuleConfig(): Promise<BusinessRuleConfigDto> {
  const res = await api.get<BusinessRuleConfigDto>('/admin/business-rules/config');
  return res.data;
}

export async function updateWorkingHours(hoursPerDay: number): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/working-hours', { hoursPerDay });
  return res.data;
}

export async function updateWeekendRule(weekendRule: WeekendRule): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/weekend-rule', { weekendRule });
  return res.data;
}

// updateEodCutoff removed — the deadline is set per shift via createShift/updateShift's
// eodCutoffHours; PUT /admin/business-rules/eod-cutoff no longer exists.

export async function updateReminderLeadTime(leadMinutes: number): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/reminder-lead-time', { leadMinutes });
  return res.data;
}

export async function updateEscalationSla(slaHours: number): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/escalation-sla', { slaHours });
  return res.data;
}

export interface AllowancesPayload {
  lateArrivalAllowance: number;
  earlyLeaveAllowance: number;
  interveningAllowance: number;
}

export async function updateAllowances(payload: AllowancesPayload): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/allowances', payload);
  return res.data;
}

// ── Shift timings ───────────────────────────────────────────────────────────

export async function listShifts(): Promise<ShiftDefinitionDto[]> {
  const res = await api.get<ShiftDefinitionDto[]>('/admin/business-rules/shifts');
  return res.data;
}

export interface ShiftPayload {
  name: string;
  startTime: string;
  endTime: string;
  /** Null clears the deadline, which disables the reminder for everyone on this shift. */
  eodCutoffHours: number | null;
}

export async function createShift(payload: ShiftPayload): Promise<ShiftDefinitionDto> {
  const res = await api.post<ShiftDefinitionDto>('/admin/business-rules/shifts', payload);
  return res.data;
}

export async function updateShift(id: number, payload: ShiftPayload): Promise<ShiftDefinitionDto> {
  const res = await api.put<ShiftDefinitionDto>(`/admin/business-rules/shifts/${id}`, payload);
  return res.data;
}

export async function toggleShift(id: number): Promise<ShiftDefinitionDto> {
  const res = await api.patch<ShiftDefinitionDto>(`/admin/business-rules/shifts/${id}/toggle`);
  return res.data;
}

export async function deleteShift(id: number): Promise<void> {
  await api.delete(`/admin/business-rules/shifts/${id}`);
}

// ── Holiday calendar ────────────────────────────────────────────────────────

export async function listHolidays(): Promise<HolidayDto[]> {
  const res = await api.get<HolidayDto[]>('/admin/business-rules/holidays');
  return res.data;
}

export interface HolidayPayload {
  name: string;
  holidayDate: string;
}

export async function createHoliday(payload: HolidayPayload): Promise<HolidayDto> {
  const res = await api.post<HolidayDto>('/admin/business-rules/holidays', payload);
  return res.data;
}

export async function deleteHoliday(id: number): Promise<void> {
  await api.delete(`/admin/business-rules/holidays/${id}`);
}
