/**
 * Small pieces of the Daily Log form that replaced the old right-hand cards:
 *  - SubmissionWindow (+ useSubmissionWindow.ts) → the "Submission window" card (countdown, closes-at, closed, late)
 *  - ApprovalStatusLine                      → the "Approval" card (reviewer + status per piece)
 *  - HowItWorksPopover                       → the "How it works" card (five steps, behind a button)
 * Presentation only: the cutoff, the reviewers and the statuses all come from the same API data as before.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle, Clock, HelpCircle } from 'lucide-react';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import type { WindowState } from './useSubmissionWindow';
import { PIECE_STATUS, pieceText } from './dailyLogStatus';

// ── Submission window ─────────────────────────────────────────────────────────

const left = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

/**
 * Open  → a small neutral chip ("Closes 9:00 PM · 3h 12m left"), amber under an hour.
 * Closed, entry still editable → a red banner (the old card's "Closed" + "Late submissions still accepted"
 *   and the old top banner's "marked late" note, in one place).
 * Closed, entry already filed → a red chip: the window is shut and nothing more can be done about it.
 */
export function SubmissionWindow({ state, editable }: { state: WindowState; editable: boolean }) {
  if (state.kind === 'none') return null;

  if (state.kind === 'open') {
    const tone = state.urgent ? 'rgba(224,169,59,' : null;
    return (
      <span
        title={`Submit before ${state.closesAt}${state.nextDay ? ' (next day)' : ' today'} to be on time`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20,
          flex: '0 1 auto', minWidth: 0, maxWidth: '100%',
          fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
          color: state.urgent ? '#E0A93B' : 'var(--txt-mut)',
          background: tone ? `${tone}.08)` : 'var(--raised2)',
          border: `1px solid ${tone ? `${tone}.3)` : 'var(--line2)'}`,
        }}
      >
        <Clock size={12} aria-hidden />
        Closes {state.closesAt}{state.nextDay ? ' (next day)' : ''} · {left(state.minutesLeft)} left
        {state.urgent ? ' — submit soon' : ''}
      </span>
    );
  }

  if (!editable) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 12,
        fontWeight: 500, color: '#E4373D', background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.3)',
      }}>
        <Clock size={12} aria-hidden />Window closed at {state.closesAt}
      </span>
    );
  }

  return (
    <div role="status" style={{
      flexBasis: '100%', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 8,
      background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.3)',
    }}>
      <Clock size={15} style={{ color: '#E4373D', flexShrink: 0, marginTop: 1 }} aria-hidden />
      <div>
        <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>Submission window closed at {state.closesAt}.</div>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginTop: 2 }}>
          Late submissions are still accepted — entries submitted after the cutoff are marked late.
        </div>
      </div>
    </div>
  );
}

// ── Approval status line ──────────────────────────────────────────────────────

export function ApprovalStatusLine({ pieces }: { pieces: ApprovalPieceDto[] }) {
  if (!pieces.length) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 1 auto', minWidth: 0, maxWidth: '100%', fontSize: 12, color: 'var(--txt-dim)' }}>
        <Clock size={12} aria-hidden />Your reviewer is assigned when you submit.
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {pieces.map(p => {
        const cfg = PIECE_STATUS[p.status] ?? PIECE_STATUS.PENDING;
        const Icon = p.approverType === 'AUTO_APPROVED' ? CheckCircle : cfg.Icon;
        const color = p.approverType === 'AUTO_APPROVED' ? PIECE_STATUS.APPROVED.color : cfg.color;
        // A comment on anything but a rejection (a rejection's lives in the banner) stays visible.
        const note = p.status !== 'REJECTED' && p.comment ? p.comment : null;
        return (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--txt-mut)' }}>
            <Icon size={13} style={{ color, flexShrink: 0 }} aria-hidden />
            <span style={{ color: 'var(--txt)', fontWeight: 500 }}>{pieceText(p)}</span>
            {note && <span style={{ color: 'var(--txt-dim)' }}>— “{note}”</span>}
          </span>
        );
      })}
    </div>
  );
}

// ── How it works popover ──────────────────────────────────────────────────────

const STEPS = [
  'Select your day type and work location.',
  'Add category line items for your time breakdown.',
  'Fill in your next-day plan, then submit.',
  'Leave or holiday days are auto-approved instantly.',
  'Rejected logs can be edited and resubmitted.',
];

/** A help button that opens a small popover. Enter/Space opens it; Escape closes it and returns focus to the
 *  button; a click or Tab outside closes it without stealing focus back. */
export function HowItWorksPopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label="How the daily log works"
        title="How it works"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6,
          background: open ? 'var(--raised2)' : 'transparent', border: '1px solid transparent', cursor: 'pointer',
          color: 'var(--txt-dim)', flexShrink: 0,
        }}
      >
        <HelpCircle size={16} aria-hidden />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="How the daily log works"
          tabIndex={-1}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== triggerRef.current) setOpen(false); }}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 20, width: 'min(340px, 86vw)', padding: '14px 16px',
            background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', outline: 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-mut)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            How it works
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map((text, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span aria-hidden style={{
                  width: 20, height: 20, borderRadius: '50%', background: 'var(--raised2)', border: '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
                }}>{i + 1}</span>
                <span style={{ fontSize: 12.5, color: 'var(--txt-mut)', lineHeight: 1.6 }}>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
