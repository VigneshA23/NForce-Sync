/**
 * Daily Log — PLAIN_LOG EOD form for PM / Admin / SuperAdmin roles.
 *
 * Decision summary (from spec):
 *  - hours=0 → leave day, auto-approved, summary optional
 *  - hours>0 → work day, summary required (20–4000 chars)
 *  - No work location, no next-day plan
 *  - 8h is a reference warning only; >24h is blocked
 *  - Same /eod/submit URL, same cutoff logic (backend enforces)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, XCircle, AlertTriangle, Send, Save, Copy } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { todayISO, formatDate, formatTime12h } from '../../lib/date';
import { saveDraft, submitEntry, listEntries } from '../../api/eod';
import { useEntryPieces } from '../../api/approvalPieces';
import { useDashboardSummary } from '../../api/employee';
import { DatePicker } from '../../components/DatePicker';
import type { EodEntryDto } from '../../api/eod';

const AUTOSAVE_DELAY_MS = 2000;

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP = 0.25;
const MIN_SUMMARY_LEN = 20;
const MAX_SUMMARY_LEN = 4000;
const MAX_NOTES_LEN   = 8000;

const QUICK_CHIPS = [
  'Meetings and calls',
  'Reviews and approvals',
  'Planning and strategy',
  'People and 1:1s',
  'Hiring and interviews',
  'Client or stakeholder',
  'Documentation',
  'Training',
] as const;

const PIECE_STATUS: Record<string, { color: string; label: string; Icon: typeof CheckCircle }> = {
  APPROVED: { color: 'var(--ok)',   label: 'Approved', Icon: CheckCircle },
  REJECTED: { color: 'var(--risk)', label: 'Rejected', Icon: XCircle },
  PENDING:  { color: 'var(--txt-dim)', label: 'Pending', Icon: Clock },
};

const ENTRY_STATUS_LABEL: Record<string, { color: string; label: string }> = {
  DRAFT:     { color: 'var(--txt-dim)',     label: 'Draft'     },
  SUBMITTED: { color: 'var(--info)',         label: 'Submitted' },
  APPROVED:  { color: 'var(--ok)',           label: 'Approved'  },
  REJECTED:  { color: 'var(--risk)',         label: 'Rejected'  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function round25(v: number): number {
  return Math.round(v / STEP) * STEP;
}

function fmt(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

function isEditable(entry: EodEntryDto | null | undefined): boolean {
  if (!entry) return true;
  return entry.status === 'DRAFT' || entry.status === 'REJECTED';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DailyLogForm() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedDate, setSelectedDate] = useState<string>(searchParams.get('date') ?? todayISO());
  const [hours, setHours]       = useState<number>(8);
  const [summary, setSummary]   = useState<string>('');
  const [notes, setNotes]       = useState<string>('');
  const [dirty, setDirty]       = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['eod', 'list', user?.id, selectedDate],
    queryFn: () => listEntries(undefined, selectedDate, selectedDate),
    enabled: !!user,
    staleTime: 15_000,
  });

  // Yesterday's entry — fetched lazily on button click, not on mount.
  const [loadYesterday, setLoadYesterday] = useState(false);
  const prevDate = (() => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const { data: yesterdayEntries } = useQuery({
    queryKey: ['eod', 'list', user?.id, prevDate],
    queryFn: () => listEntries(undefined, prevDate, prevDate),
    enabled: !!user && loadYesterday,
    staleTime: 60_000,
  });

  // Cutoff status for today — drives the countdown card.
  const { data: dashboard } = useDashboardSummary();

  const entry: EodEntryDto | null = entries?.[0] ?? null;
  const entryId = entry?.id ?? null;

  const { data: pieces } = useEntryPieces(entryId);

  // Sync form state whenever the entry changes (different date or fresh data)
  useEffect(() => {
    if (entry?.entryForm === 'PLAIN_LOG') {
      setHours(entry.logTotalHours ?? 8);
      setSummary(entry.logSummary ?? '');
      setNotes(entry.logNotes ?? '');
    } else if (!entry) {
      setHours(8);
      setSummary('');
      setNotes('');
    }
    setDirty(false);
  }, [entry?.id, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync ?date= search param
  useEffect(() => {
    setSearchParams(selectedDate === todayISO() ? {} : { date: selectedDate }, { replace: true });
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ────────────────────────────────────────────────────────────

  // buildReq defined before mutations so saveMut / submitMut can reference it.
  // useCallback declared here; the autosave useEffect below references the same instance.
  const buildReq = useCallback(() => ({
    entryDate: selectedDate,
    dayType: 'WORKING_DAY' as const,
    timeAdjustmentType: null,
    timeAdjustmentMinutes: null,
    workLocation: null,
    nextDayPlan: null,
    remarks: null,
    tasks: [],
    attachmentIds: [],
    entryForm: 'PLAIN_LOG' as const,
    logSummary: summary.trim() || null,
    logTotalHours: hours,
    logNotes: notes.trim() || null,
  }), [selectedDate, summary, hours, notes]);

  // Copy yesterday's log values into the form.
  const handleCopyYesterday = useCallback(() => {
    if (!loadYesterday) {
      setLoadYesterday(true);
      return; // will re-render once query resolves
    }
    const prev = yesterdayEntries?.[0];
    if (!prev || prev.entryForm !== 'PLAIN_LOG') {
      showToast('error', 'No daily log found for yesterday');
      return;
    }
    setHours(prev.logTotalHours ?? 8);
    setSummary(prev.logSummary ?? '');
    setNotes(prev.logNotes ?? '');
    setDirty(true);
    showToast('success', 'Copied from yesterday');
  }, [loadYesterday, yesterdayEntries, showToast]);

  // Trigger copy once the query resolves (if the user already clicked).
  useEffect(() => {
    if (!loadYesterday || !yesterdayEntries) return;
    const prev = yesterdayEntries[0];
    if (!prev || prev.entryForm !== 'PLAIN_LOG') return;
    setHours(prev.logTotalHours ?? 8);
    setSummary(prev.logSummary ?? '');
    setNotes(prev.logNotes ?? '');
    setDirty(true);
    setLoadYesterday(false);
    showToast('success', 'Copied from yesterday');
  }, [yesterdayEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  const insertChip = useCallback((chip: string) => {
    setSummary(prev => prev.trim() ? `${prev.trim()}\n${chip}` : chip);
    setDirty(true);
  }, []);

  const saveMut = useMutation({
    mutationFn: () => saveDraft(buildReq()),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', 'Draft saved');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save draft';
      showToast('error', msg);
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const saved = await saveDraft(buildReq());
      return submitEntry(saved.id);
    },
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', hours === 0 ? 'Leave day recorded' : 'Daily log submitted');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Submission failed';
      showToast('error', msg);
    },
  });

  // ── Derived state ────────────────────────────────────────────────────────

  const isLeave  = hours === 0;
  const editable = isEditable(entry);
  const isRejected = entry?.status === 'REJECTED';

  const summaryLen  = summary.length;
  const summaryOk   = isLeave || (summaryLen >= MIN_SUMMARY_LEN && summaryLen <= MAX_SUMMARY_LEN);
  const hoursOver8  = hours > 0 && hours > 8;
  const canSubmit   = editable && summaryOk && !saveMut.isPending && !submitMut.isPending;

  const rejectionComment = pieces?.find(p => p.status === 'REJECTED')?.comment ?? null;

  // ── Autosave (debounced, silent) ─────────────────────────────────────────

  useEffect(() => {
    if (!dirty || !editable) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaving(true);
      try { await saveDraft(buildReq()); qc.invalidateQueries({ queryKey: ['eod'] }); }
      catch { /* silent */ }
      finally { setAutosaving(false); setDirty(false); }
    }, AUTOSAVE_DELAY_MS);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [dirty, hours, summary, notes, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ───────────────────────────────────────────────────────────────

  if (entriesLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--txt-dim)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--txt)', letterSpacing: '-0.01em' }}>
          Daily Log
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--txt-mut)' }}>
          Submit your end-of-day summary for review
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>

        {/* ── Left: form card ── */}
        <div style={{
          background: 'var(--raised)', borderRadius: 12,
          border: '1px solid var(--line)', padding: 24,
        }}>

          {/* Date + Copy yesterday */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Date</label>
              {editable && (
                <button
                  onClick={handleCopyYesterday}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--txt-dim)', padding: '2px 4px',
                  }}
                >
                  <Copy size={12} />
                  Copy yesterday
                </button>
              )}
            </div>
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              disabled={!editable && !!entry}
            />
          </div>

          {/* Entry status banner */}
          {entry && !editable && (
            <EntryStatusBanner entry={entry} />
          )}

          {/* Rejection banner (re-editable) */}
          {isRejected && (
            <div style={{
              marginBottom: 20, padding: '12px 14px', borderRadius: 8,
              background: 'rgba(228,55,61,0.08)', border: '1px solid rgba(228,55,61,0.25)',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={15} color="var(--risk)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--risk)', marginBottom: 2 }}>Rejected</div>
                {rejectionComment && (
                  <div style={{ fontSize: 13, color: 'var(--txt)' }}>{rejectionComment}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginTop: 4 }}>
                  Edit your log and resubmit below.
                </div>
              </div>
            </div>
          )}

          {/* Hours slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={labelStyle}>Hours worked</label>
              <span style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 15, fontWeight: 700,
                color: isLeave ? 'var(--warn)' : hoursOver8 ? 'var(--ok)' : 'var(--txt)',
              }}>
                {isLeave ? 'Leave day' : fmt(hours)}
              </span>
            </div>

            <input
              type="range"
              min={0} max={24} step={STEP}
              value={hours}
              disabled={!editable}
              onChange={e => { setHours(round25(parseFloat(e.target.value))); setDirty(true); }}
              style={{ width: '100%', accentColor: 'var(--brand)', cursor: editable ? 'pointer' : 'not-allowed' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--txt-dim)', marginTop: 4 }}>
              <span>0h (Leave)</span>
              <span style={{ color: hoursOver8 ? 'var(--ok)' : 'var(--txt-dim)' }}>8h reference</span>
              <span>24h</span>
            </div>
            {hoursOver8 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={13} />
                Logging overtime — this will be reviewed by your manager.
              </div>
            )}
          </div>

          {/* Manual hours input */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Or enter hours directly</label>
            <input
              type="number"
              min={0} max={24} step={STEP}
              value={hours}
              disabled={!editable}
              onChange={e => {
                const v = round25(parseFloat(e.target.value) || 0);
                setHours(Math.min(24, Math.max(0, v)));
                setDirty(true);
              }}
              style={{
                ...inputStyle,
                width: 100, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
              }}
            />
          </div>

          {/* Leave notice */}
          {isLeave && (
            <div style={{
              marginBottom: 20, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(224,169,59,0.1)', border: '1px solid rgba(224,169,59,0.25)',
              fontSize: 13, color: 'var(--warn)',
            }}>
              Leave day — this will be auto-approved. Summary is optional.
            </div>
          )}

          {/* Work summary */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={labelStyle}>
                Work summary{!isLeave && <span style={{ color: 'var(--risk)', marginLeft: 3 }}>*</span>}
              </label>
              <span style={{
                fontSize: 11,
                color: summaryLen > MAX_SUMMARY_LEN ? 'var(--risk)'
                     : summaryLen >= MIN_SUMMARY_LEN ? 'var(--ok)'
                     : 'var(--txt-dim)',
              }}>
                {summaryLen}/{MAX_SUMMARY_LEN}
              </span>
            </div>

            {/* Quick-insert chips */}
            {editable && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {QUICK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => insertChip(chip)}
                    style={{
                      padding: '3px 10px', borderRadius: 20,
                      background: 'var(--raised2)', border: '1px solid var(--line)',
                      fontSize: 11, color: 'var(--txt-mut)', cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <textarea
              rows={5}
              placeholder={isLeave ? 'Optional — describe your day or leave reason' : 'Describe what you worked on today (min 20 chars)'}
              value={summary}
              disabled={!editable}
              onChange={e => { setSummary(e.target.value); setDirty(true); }}
              maxLength={MAX_SUMMARY_LEN}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: 100, lineHeight: 1.6 }}
            />
            {!isLeave && summaryLen > 0 && summaryLen < MIN_SUMMARY_LEN && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--warn)' }}>
                At least {MIN_SUMMARY_LEN} characters required ({MIN_SUMMARY_LEN - summaryLen} more)
              </div>
            )}
          </div>

          {/* Additional notes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={labelStyle}>Additional notes <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>(optional)</span></label>
              <span style={{ fontSize: 11, color: notes.length > MAX_NOTES_LEN ? 'var(--risk)' : 'var(--txt-dim)' }}>
                {notes.length}/{MAX_NOTES_LEN}
              </span>
            </div>
            <textarea
              rows={3}
              placeholder="Blockers, follow-ups, anything else your manager should know"
              value={notes}
              disabled={!editable}
              onChange={e => { setNotes(e.target.value); setDirty(true); }}
              maxLength={MAX_NOTES_LEN}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          {/* Actions */}
          {editable && !confirming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || submitMut.isPending}
                style={secondaryBtnStyle}
              >
                <Save size={14} />
                {saveMut.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={!canSubmit}
                style={canSubmit ? primaryBtnStyle : { ...primaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }}
              >
                <Send size={14} />
                {isLeave ? 'Record leave' : 'Submit'}
              </button>
              {autosaving && (
                <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>Autosaving…</span>
              )}
            </div>
          )}

          {/* Confirmation dialog (inline) */}
          {editable && confirming && (
            <div style={{
              padding: '14px 16px', borderRadius: 8,
              background: 'rgba(177,17,22,0.07)', border: '1px solid rgba(177,17,22,0.25)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 8 }}>
                {isLeave
                  ? 'Record this as a leave day? It will be auto-approved.'
                  : `Submit your daily log for ${formatDate(selectedDate)}?`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirming(false)} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirming(false); submitMut.mutate(); }}
                  disabled={submitMut.isPending}
                  style={primaryBtnStyle}
                >
                  <Send size={14} />
                  {submitMut.isPending ? 'Submitting…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* ── Right: reviewer / status card ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dashboard?.cutoffStatus && selectedDate === todayISO() && (
            <CutoffCard
              cutoffTime={dashboard.cutoffStatus.cutoffTime}
              cutoffPassed={dashboard.cutoffStatus.cutoffPassed}
              cutoffNextDay={dashboard.cutoffStatus.cutoffNextDay}
            />
          )}
          <ReviewerCard entry={entry} pieces={pieces ?? []} />
          <QuickHelpCard />
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EntryStatusBanner({ entry }: {
  entry: EodEntryDto;
}) {
  const cfg = ENTRY_STATUS_LABEL[entry.status] ?? { color: 'var(--txt-dim)', label: entry.status };
  return (
    <div style={{
      marginBottom: 20, padding: '10px 14px', borderRadius: 8,
      background: 'var(--raised2)', border: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{cfg.label}</span>
      {entry.submittedAt && (
        <span style={{ fontSize: 12, color: 'var(--txt-dim)', marginLeft: 'auto' }}>
          {formatDate(entry.submittedAt)}
        </span>
      )}
    </div>
  );
}

function ReviewerCard({ entry, pieces }: {
  entry: EodEntryDto | null;
  pieces: import('../../api/approvalPieces').ApprovalPieceDto[];
}) {
  if (!entry || !pieces.length) {
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>Reviewer</div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-dim)', lineHeight: 1.6 }}>
          Submit your daily log to see who will review it.
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>Approval</div>
      {pieces.map(p => {
        const cfg = PIECE_STATUS[p.status] ?? PIECE_STATUS.PENDING;
        const Icon = cfg.Icon;
        const typeLabel = p.approverType === 'REPORTING_MANAGER' ? 'Reporting Manager'
                        : p.approverType === 'ADMIN_GROUP'       ? 'Admin Group'
                        : p.approverType === 'AUTO_APPROVED'     ? 'Auto-approved'
                        : p.approverType;
        return (
          <div key={p.id} style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--raised2)', border: '1px solid var(--line)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={14} color={cfg.color} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                {p.approverName ?? typeLabel}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 600,
                color: cfg.color, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{typeLabel}</div>
            {p.comment && (
              <div style={{
                fontSize: 12, color: 'var(--txt)',
                padding: '6px 8px', borderRadius: 6,
                background: 'rgba(228,55,61,0.07)',
              }}>
                {p.comment}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuickHelpCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>How it works</div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.8 }}>
        <li>Log <strong style={{ color: 'var(--txt)' }}>0 hours</strong> for a leave day — auto-approved.</li>
        <li>Work days go to your reporting manager.</li>
        <li>Rejected logs can be edited and resubmitted.</li>
        <li>8h is a reference — overtime is allowed.</li>
      </ul>
    </div>
  );
}

function CutoffCard({
  cutoffTime, cutoffPassed, cutoffNextDay,
}: {
  cutoffTime: string | null;
  cutoffPassed: boolean;
  cutoffNextDay: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!cutoffTime) return null;

  const [hh, mm] = cutoffTime.split(':').map(Number);
  const cutoffDate = new Date(now);
  if (cutoffNextDay) cutoffDate.setDate(cutoffDate.getDate() + 1);
  cutoffDate.setHours(hh, mm, 0, 0);

  const diffMs   = cutoffDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const hours    = Math.floor(diffMins / 60);
  const mins     = diffMins % 60;

  const passed = cutoffPassed || diffMs <= 0;
  const urgent = !passed && diffMins < 60;

  const color = passed ? 'var(--risk)' : urgent ? 'var(--warn)' : 'var(--txt-mut)';
  const label = passed
    ? 'Cutoff passed'
    : hours > 0
    ? `${hours}h ${mins}m until cutoff`
    : `${mins}m until cutoff`;

  return (
    <div style={{ ...cardStyle, borderColor: passed ? 'rgba(228,55,61,0.3)' : urgent ? 'rgba(224,169,59,0.3)' : 'var(--line)' }}>
      <div style={cardHeaderStyle}>Submission window</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Clock size={13} color={color} />
        <span style={{ fontSize: 13, color, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
        Cutoff: {formatTime12h(cutoffTime)}{cutoffNextDay ? ' (next day)' : ''}
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6,
  fontSize: 12, fontWeight: 600,
  color: 'var(--txt-mut)', letterSpacing: '0.05em', textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--raised2)', border: '1px solid var(--line)',
  borderRadius: 8, padding: '8px 12px',
  fontSize: 14, color: 'var(--txt)',
  outline: 'none', boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 18px', borderRadius: 8,
  background: 'var(--brand)', border: 'none',
  fontSize: 13, fontWeight: 600, color: '#fff',
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 18px', borderRadius: 8,
  background: 'var(--raised2)', border: '1px solid var(--line)',
  fontSize: 13, fontWeight: 600, color: 'var(--txt)',
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--raised)', border: '1px solid var(--line)',
  borderRadius: 12, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 12,
};

const cardHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700,
  color: 'var(--txt-mut)', letterSpacing: '0.08em', textTransform: 'uppercase',
};
