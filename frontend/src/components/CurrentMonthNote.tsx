import { CURRENT_MONTH_NOTE } from '../lib/reportDefaultRange';

/** Small muted helper under a report's filter row; see lib/reportDefaultRange.ts for when it shows. */
export function CurrentMonthNote() {
  return (
    <div style={{ fontSize: 12.5, color: 'var(--txt-mut)', textAlign: 'left', marginTop: 10 }}>
      {CURRENT_MONTH_NOTE}
    </div>
  );
}
