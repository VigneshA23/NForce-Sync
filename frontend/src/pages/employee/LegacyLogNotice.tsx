import { legacyLogOf, type LegacyLogSource } from './dailyLogLegacy';

/**
 * What the Daily Log form shows for a legacy plain-log entry (summary + hours, no line items):
 * - editable (no entry, draft, rejected): the existing "Legacy entry format" notice, unchanged;
 * - locked (pending, approved, …): a read-only block with the "Daily log" label, the summary and the hours
 *   against the daily cap, so a submitted day isn't shown as an empty form.
 * Renders nothing for an entry with no legacy fields. Display only: it reads the loaded entry and never
 * touches form state, so nothing here reaches a save.
 */
export function LegacyLogNotice({ entry, isEditable, dailyCap }: {
  entry: LegacyLogSource | null | undefined;
  /** The form's own editable/locked decision — passed in, not re-derived here. */
  isEditable: boolean;
  dailyCap: number;
}) {
  const legacy = legacyLogOf(entry);
  if (!legacy) return null;

  if (isEditable) {
    return (
      <div style={{ padding:'12px 14px', borderRadius:8, marginBottom:12, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.2)', fontSize:12, color:'var(--warn)' }}>
        Legacy entry format. Add line items below to convert.
        {legacy.summary && <div style={{ marginTop:6, color:'var(--txt-dim)', whiteSpace:'pre-wrap' }}>{legacy.summary}</div>}
      </div>
    );
  }

  const over = legacy.hours > dailyCap;
  return (
    <div data-testid="legacy-log-readonly" style={{ padding:'14px 16px', borderRadius:8, marginBottom:12, background:'var(--raised)', border:'1px solid var(--line)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom: legacy.summary?.trim() ? 10 : 0 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>Daily log</span>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:72, height:5, borderRadius:3, background:'var(--line2)', overflow:'hidden' }} aria-hidden>
            <div style={{ height:'100%', borderRadius:3, width:`${Math.min(100, (legacy.hours / Math.max(0.01, dailyCap)) * 100)}%`, background: over ? 'var(--warn)' : 'var(--ok)' }} />
          </div>
          <div style={{ fontSize:13, color:'var(--txt-mut)', fontVariantNumeric:'tabular-nums' }}>
            <span style={{ color:'var(--txt)', fontWeight:600 }}>{legacy.hours.toFixed(1)}</span>
            {' '}/ {dailyCap.toFixed(1)} hrs
          </div>
        </div>
      </div>
      {legacy.summary?.trim() && (
        <div style={{ fontSize:13, color:'var(--txt)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{legacy.summary}</div>
      )}
    </div>
  );
}
