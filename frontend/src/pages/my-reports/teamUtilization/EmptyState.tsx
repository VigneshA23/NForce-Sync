import type { LucideIcon } from 'lucide-react';
import { Card } from '../../../components/KpiCard';

/** Local to Team Utilization — the app has no shared empty-state component. */
export function EmptyState({
  Icon, title, body, action,
}: {
  Icon: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Card style={{ padding: '56px 20px', textAlign: 'center' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-dim)',
        background: 'var(--raised2)',
      }}>
        <Icon size={24} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>{title}</div>
      {body && <div style={{ fontSize: 13, color: 'var(--txt-dim)', maxWidth: 420, margin: '0 auto' }}>{body}</div>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: 16, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)',
            borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}
