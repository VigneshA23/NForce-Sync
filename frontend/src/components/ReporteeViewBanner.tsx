import { Shield } from 'lucide-react';

/**
 * Lightweight "you are viewing reportee data" label for a Super Admin Reportee Views page that
 * has no picker of its own (see ReporteeScopePicker for pages that do — that component already
 * carries this same message, so a page using it should not also render this banner).
 */
export function ReporteeViewBanner({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'color-mix(in srgb, var(--accent, #A78BFA) 10%, var(--panel))',
      border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    }}>
      <Shield size={15} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--txt-dim)', fontWeight: 600 }}>
        Super Admin: {label} (read-only, system-wide)
      </span>
    </div>
  );
}
