import { api } from './client';

// ── Response types (mirror backend DTOs) ──────────────────────────────────────

export type WeekendRule = 'SAT_SUN' | 'SUN_ONLY';

export interface BusinessRuleConfigDto {
  workingHoursPerDay: number;
  weekendRule: WeekendRule;
  // No eodCutoffTime: the EOD deadline is per shift now — see ShiftDefinitionDto.eodCutoffHours.
  reminderLeadMinutes: number;
  escalationSlaHours: number;
  /** Account Lockout: consecutive failed sign-ins that lock an account, and for how long. */
  lockoutAttemptThreshold: number;
  lockoutDurationMinutes: number;
  /** Monthly time-adjustment budget in minutes, shared across all three types. Global — no
   *  overrides. Replaced three per-type use-counts in V62. */
  monthlyAdjustmentMinutes: number;
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

// One request per CARD, not per field. business_rule_config is a single row and every update
// rewrites all of it, so firing a request per field from one Save button raced on the server: the
// last write to commit reverted the others, and the change looked like it hadn't saved.

export interface TimeAttendancePayload {
  hoursPerDay: number;
  weekendRule: WeekendRule;
}

export async function updateTimeAttendance(payload: TimeAttendancePayload): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/time-attendance', payload);
  return res.data;
}

// updateEodCutoff removed — the deadline is set per shift via createShift/updateShift's
// eodCutoffHours; PUT /admin/business-rules/eod-cutoff no longer exists.

export interface NotificationsPayload {
  reminderLeadMinutes: number;
  escalationSlaHours: number;
  /** Account Lockout policy — saved with the rest of the card so the row is written once. */
  lockoutAttemptThreshold: number;
  lockoutDurationMinutes: number;
}

export async function updateNotifications(payload: NotificationsPayload): Promise<BusinessRuleConfigDto> {
  const res = await api.put<BusinessRuleConfigDto>('/admin/business-rules/notifications', payload);
  return res.data;
}

export interface AllowancesPayload {
  monthlyAdjustmentMinutes: number;
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

export async function updateHoliday(id: number, payload: HolidayPayload): Promise<HolidayDto> {
  const res = await api.put<HolidayDto>(`/admin/business-rules/holidays/${id}`, payload);
  return res.data;
}

export async function deleteHoliday(id: number): Promise<void> {
  await api.delete(`/admin/business-rules/holidays/${id}`);
}
