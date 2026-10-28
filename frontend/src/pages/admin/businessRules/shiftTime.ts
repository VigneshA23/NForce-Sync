import { formatTime12h } from '../../../lib/date';

// Truncates a backend "HH:mm:ss" string to the "HH:mm" shape <input type="time"> expects.
export function toHm(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function toMinutes(time: string): number {
  const [h, m] = toHm(time).split(':').map(Number);
  return h * 60 + m;
}

/**
 * When a shift's EOD is actually due, as an absolute clock time rather than an offset the reader
 * has to add up — "+3h → 3:30 AM (next day)" for a 15:30-00:30 shift.
 *
 * Mirrors ShiftSchedule.cutoffAt on the backend: an end at or before the start crosses midnight,
 * and the cutoff is measured from that end.
 */
export function cutoffLabel(startTime: string, endTime: string, hours: number | null): string {
  if (hours == null) return '—';
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin <= startMin) endMin += 1440;

  const cutoffMin = endMin + Math.round(hours * 60);
  const clock = ((cutoffMin % 1440) + 1440) % 1440;
  const daysAfter = Math.floor(cutoffMin / 1440);
  const hhmmss = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}:00`;

  const suffix = daysAfter === 0 ? '' : daysAfter === 1 ? ' (next day)' : ` (+${daysAfter} days)`;
  return `+${hours}h → ${formatTime12h(hhmmss)}${suffix}`;
}
