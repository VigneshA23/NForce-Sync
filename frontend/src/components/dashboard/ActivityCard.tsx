import type { LucideIcon } from 'lucide-react';
import { Activity as ActivityIcon } from 'lucide-react';
import { ListPanelCard, ListPanelRow, ListPanelEmpty } from './ListPanelCard';

export interface ActivityItem {
  id: string | number;
  icon: LucideIcon;
  text: string;
  time: string;
  accent?: string;
}

/**
 * Generic timestamped activity/event feed — reused for "Recent Activity" (Employee/Team
 * Lead/Admin) and "Recent System Logs" / "Recent Alerts" (Super Admin). Renders whatever
 * `items` its caller's own existing data hook already produced; never fabricates entries.
 */
export function ActivityCard({
  title = 'Recent Activity', items, viewAllPath, emptyLabel = 'No recent activity',
}: {
  title?: string;
  items: ActivityItem[];
  viewAllPath?: string;
  emptyLabel?: string;
}) {
  return (
    <ListPanelCard title={title} icon={ActivityIcon} viewAllPath={viewAllPath} maxHeight={320}>
      {items.length === 0 ? (
        <ListPanelEmpty>{emptyLabel}</ListPanelEmpty>
      ) : (
        items.map(({ id, icon: Icon, text, time, accent = 'var(--txt-mut)' }) => (
          <ListPanelRow key={id} style={{ alignItems: 'flex-start' }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
            }}>
              <Icon size={13} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.4 }}>{text}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 2 }}>{time}</div>
            </div>
          </ListPanelRow>
        ))
      )}
    </ListPanelCard>
  );
}
