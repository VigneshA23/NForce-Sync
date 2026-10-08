import { useState } from 'react';
import {
  useMemberUtilizationDays, useMemberUtilizationEntries,
  type UtilizationMember, type UtilizationSummary,
} from '../../../api/teamUtilization';
import { DatePanel } from './DatePanel';
import { EntriesPanel } from './EntriesPanel';
import { daysWindowFor, defaultSelectedDate } from './utilizationLogic';

/**
 * The expanded row: the entries for one date (left) and the date picker (right). Mounted only once a
 * row has been opened, so nothing is fetched until then. Picking another date swaps the entries
 * without collapsing the row; both queries are cached, so revisiting a date is instant.
 */
export function MemberDetail({
  member, summary, today,
}: {
  member: UtilizationMember;
  summary: UtilizationSummary;
  today: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const window = daysWindowFor(summary, today);
  const daysQuery = useMemberUtilizationDays(member.id, summary.period, window?.from ?? '', window?.to ?? '', !!window);

  // The Day tab already knows its date, so its entries load in parallel with the day values. Week and
  // Month wait for the day values to find "the latest working day that has data" — but if those fail,
  // fall back to the period's last day so the entries box still works.
  const defaultDate = summary.period === 'day'
    ? summary.to
    : daysQuery.data ? defaultSelectedDate(summary, daysQuery.data.days)
    : daysQuery.isError ? summary.to
    : null;
  const selected = picked ?? defaultDate;

  const entriesQuery = useMemberUtilizationEntries(member.id, selected, true);

  return (
    <div className="tu-detail-grid">
      <EntriesPanel date={selected} query={entriesQuery} />
      <DatePanel summary={summary} query={daysQuery} selected={selected} onSelect={setPicked} />
    </div>
  );
}
