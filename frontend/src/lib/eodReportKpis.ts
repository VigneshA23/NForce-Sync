/**
 * Average hours logged per employee for the EOD Reports KPI cards: total hours ÷ employees, rounded
 * to one decimal. Guards the divide-by-zero case (no employees in the range) and any non-finite
 * input, returning 0 rather than NaN / Infinity.
 */
export function averageHoursPerEmployee(totalHours: number, employeeCount: number): number {
  if (!(employeeCount > 0) || !Number.isFinite(totalHours) || !Number.isFinite(employeeCount)) return 0;
  return Math.round((totalHours / employeeCount) * 10) / 10;
}

/** Whole numbers stay whole ("120"), fractions show one decimal ("7.5") — the report's existing hours style. */
export function formatKpiHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** The average always shows one decimal ("8.0"), so the card reads as an average, not a count. */
export function formatAverageHours(avg: number): string {
  return avg.toFixed(1);
}
