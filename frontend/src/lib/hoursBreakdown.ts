// Shared Billable/Non-Billable/Bench → Total math for utilization "hours breakdown"
// donuts (Employee My Utilization, PM Projects Utilization "Billable Split"/"Utilization
// by Category"). Categories are displayed rounded to 1 decimal, so Total must be computed
// from those same rounded values and rounded once itself — summing raw unrounded hours and
// rounding only the total independently (or at a different decimal precision) lets the
// displayed Total silently disagree with the displayed categories' sum.

export function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

export function totalHours(billable: number, nonBillable: number, bench: number): number {
  return roundHours(roundHours(billable) + roundHours(nonBillable) + roundHours(bench));
}
