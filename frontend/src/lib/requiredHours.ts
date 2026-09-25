/**
 * Required-hours target for a given EOD day type, given the org's configured Standard Working
 * Hours (Business Rules → Time & Attendance). Mirrors EodService.dailyHoursCap()/halfDayHoursCap()
 * and SubmitEOD.tsx's expectedHrs: full day for WORKING_DAY, half for a half-day leave, 0 for
 * WEEKEND/HOLIDAY/a full LEAVE day (all optional — nothing to fall short of).
 */
export function requiredHoursForDay(dayType: string | null | undefined, workingHoursPerDay: number): number {
  switch (dayType) {
    case 'WORKING_DAY':
      return workingHoursPerDay;
    case 'FIRST_HALF_LEAVE':
    case 'SECOND_HALF_LEAVE':
      return workingHoursPerDay / 2;
    default:
      return 0;
  }
}

/** Human label for the two half-day leave types — same wording as SubmitEOD.tsx's
 *  HALF_LEAVE_LABELS / EodHistory.tsx's DAY_TYPE_LABELS, so a report never says something
 *  different from what the employee actually picked on the Submit EOD form. */
export const HALF_LEAVE_LABELS: Record<string, string> = {
  FIRST_HALF_LEAVE: 'First Half Leave',
  SECOND_HALF_LEAVE: 'Second Half Leave',
};
