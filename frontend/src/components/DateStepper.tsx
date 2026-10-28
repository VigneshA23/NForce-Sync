import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayISO } from '../lib/date';

/** The calendar day before/after an ISO date ('yyyy-MM-dd'), computed in local time like todayISO(). */
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const arrowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6,
  background: 'var(--raised2)', border: '1px solid var(--line2)', flexShrink: 0,
} as const;

/**
 * Previous-day / next-day arrows around a page title, plus a "Today" pill once the date is in the past — shared by
 * the Daily Log and Submit EOD so both step through days identically. There is no future date: Next is disabled
 * (dimmed, still visible) while viewing today. The host owns the date and whatever resetting a date change implies.
 */
export function DateStepper({ date, onChange, children }: {
  date: string;
  onChange: (date: string) => void;
  /** The page title, rendered between the two arrows. */
  children: ReactNode;
}) {
  const today = todayISO();
  const isToday = date === today;
  const isPast = date < today;
  return (
    <>
      <button
        type="button"
        onClick={() => onChange(shiftIsoDate(date, -1))}
        style={{ ...arrowStyle, cursor: 'pointer', color: 'var(--txt-mut)' }}
        aria-label="Previous day"
      >
        <ChevronLeft size={15} />
      </button>
      {children}
      <button
        type="button"
        onClick={() => onChange(shiftIsoDate(date, 1))}
        disabled={isToday}
        // Disabled while viewing today: dimmed, but still a visible chevron (it used to be var(--line) on
        // a near-identical background, which read as an empty box beside the title).
        style={{
          ...arrowStyle, cursor: isToday ? 'not-allowed' : 'pointer',
          color: isToday ? 'var(--txt-dim)' : 'var(--txt-mut)', opacity: isToday ? 0.55 : 1,
        }}
        aria-label="Next day"
      >
        <ChevronRight size={15} />
      </button>
      {isPast && (
        <button
          type="button"
          onClick={() => onChange(today)}
          style={{ padding: '4px 10px', borderRadius: 20, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt-mut)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
        >
          Today
        </button>
      )}
    </>
  );
}
