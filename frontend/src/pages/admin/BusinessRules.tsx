import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CalendarClock, CalendarDays, Clock, Clock3, Plus } from 'lucide-react';
import {
  getBusinessRuleConfig, updateTimeAttendance, updateNotifications, updateAllowances,
  listShifts, createShift, updateShift, toggleShift, deleteShift,
  listHolidays, createHoliday, deleteHoliday,
} from '../../api/businessRules';
import type { ShiftDefinitionDto, ShiftPayload, HolidayDto, WeekendRule } from '../../api/businessRules';
import { extractApiError, extractFieldErrors, isHttpStatus, listAuditLog } from '../../api/admin';
import type { AuditLogDto } from '../../api/admin';
import { formatRelative } from '../../lib/auditLog';
import { formatDate, formatTime12h } from '../../lib/date';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';

// ── Shared styles (matches OrganizationMasters.tsx idiom) ──────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-mut)',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--brand)',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid var(--line2)',
  borderRadius: 7,
  color: 'var(--txt-mut)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: 'var(--risk)',
  borderColor: 'rgba(228,55,61,.3)',
};

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 7, marginBottom: 14,
      background: 'rgba(228,55,61,.10)', border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12, color: 'var(--risk)',
    }} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      {message}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p style={{ fontSize: 11, color: 'var(--risk)', margin: '5px 0 0' }}>{msg}</p>;
}

// ── Card shell ───────────────────────────────────────────────────────────────

interface RuleCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  // Each section picks up its icon's color as a top-border + icon-badge tint,
  // so the four cards read as visually distinct at a glance instead of all
  // sharing the same flat neutral gray. Heading text itself stays var(--txt) —
  // full contrast — the accent lives in the icon and border only.
  accent: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function RuleCard({ title, description, icon, accent, children, footer }: RuleCardProps) {
  return (
    <section style={{
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderTop: `2px solid ${accent}`,
      borderRadius: 10,
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <SectionIcon icon={icon} accent={accent} />
        <div>
          <h2 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 14, fontWeight: 600, color: 'var(--txt)', margin: '0 0 3px',
          }}>
            {title}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--txt-mut)', margin: 0 }}>{description}</p>
        </div>
      </div>
      {children}
      {footer}
    </section>
  );
}

// Matches the icon-badge treatment used on the Admin Dashboard's KPI cards and
// Quick Actions (rounded square, centered icon) but tinted with the section's
// accent (background at ~9% opacity) instead of flat --raised2/--txt-mut.
function SectionIcon({ icon, accent }: { icon: React.ReactNode; accent: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: `color-mix(in srgb, ${accent} 16%, var(--raised2))`, color: accent,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {icon}
    </div>
  );
}

// Small non-editable suffix (e.g. "min", "hrs") inside a numeric input, so the
// unit is visible without re-reading the field label above.
function UnitField({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <span style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        fontSize: 11, fontWeight: 500, color: 'var(--txt-dim)', pointerEvents: 'none',
      }}>
        {unit}
      </span>
    </div>
  );
}

interface LastUpdateInfo { occurredAt: string; actorName: string }

function LastUpdatedCaption({ info }: { info: LastUpdateInfo | null }) {
  if (!info) return null;
  return (
    <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 14 }}>
      Last updated {formatRelative(info.occurredAt)} by <span style={{ color: 'var(--txt-mut)' }}>{info.actorName}</span>
    </div>
  );
}

function auditEntryName(entry: AuditLogDto): string | undefined {
  const raw = entry.afterValue ?? entry.beforeValue;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

// `entries` is already sorted occurredAt-desc by the backend, so the first match is the latest.
function findLastUpdate(
  entries: AuditLogDto[] | undefined,
  predicate: (name: string | undefined, entry: AuditLogDto) => boolean,
): LastUpdateInfo | null {
  if (!entries) return null;
  const hit = entries.find((e) => predicate(auditEntryName(e), e));
  return hit ? { occurredAt: hit.occurredAt, actorName: hit.actorName ?? 'System' } : null;
}

// Truncates a backend "HH:mm:ss" string to the "HH:mm" shape <input type="time"> expects.
function toHm(time: string): string {
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
function cutoffLabel(startTime: string, endTime: string, hours: number | null): string {
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

const WEEKEND_OPTIONS: { value: WeekendRule; label: string }[] = [
  { value: 'SAT_SUN', label: 'Saturday + Sunday off' },
  { value: 'SUN_ONLY', label: 'Sunday only' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BusinessRules() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const configQuery = useQuery({ queryKey: ['business-rules', 'config'], queryFn: getBusinessRuleConfig });
  const shiftsQuery = useQuery({ queryKey: ['business-rules', 'shifts'], queryFn: listShifts });
  const holidaysQuery = useQuery({ queryKey: ['business-rules', 'holidays'], queryFn: listHolidays });

  // Powers the "Last updated … by …" captions — same audit_log data as Recent Activity.
  const auditQuery = useQuery({
    queryKey: ['business-rules', 'audit'],
    queryFn: () => listAuditLog({ entityType: 'BUSINESS_RULE', size: 100, page: 0 }),
  });
  const auditEntries = auditQuery.data?.content;
  // Matched by name, not entityId — shift and holiday audit rows both use their own
  // table's primary key as entityId, so ids collide constantly (e.g. shift #2 and
  // holiday #2 can coexist). Names practically never collide across the two lists.
  const shiftNames = new Set((shiftsQuery.data ?? []).map((s) => s.name));
  const holidayNames = new Set((holidaysQuery.data ?? []).map((h) => h.name));

  const timeAttendanceUpdate = findLastUpdate(auditEntries, (name) =>
    name === 'Working Hours Per Day' || name === 'Weekend Rule');
  // 'EOD Cutoff Time' is intentionally still matched: the rule no longer exists, but historical
  // audit rows carry that name and this caption should keep surfacing them.
  const notificationsUpdate = findLastUpdate(auditEntries, (name) =>
    name === 'EOD Cutoff Time' || name === 'Reminder Lead Time' || name === 'Escalation SLA'
    || name === 'Lockout Attempt Threshold' || name === 'Lockout Duration Minutes');
  const allowancesUpdate = findLastUpdate(auditEntries, (name) =>
    name === 'Late Arrival Allowance' || name === 'Early Leave Allowance'
    || name === 'Intervening Allowance');
  const shiftsUpdate = findLastUpdate(auditEntries, (name) =>
    name != null && shiftNames.has(name));
  const holidaysUpdate = findLastUpdate(auditEntries, (name) =>
    name != null && holidayNames.has(name) && !shiftNames.has(name));

  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: ['business-rules', 'config'] });

  // ── 1. Working hours per day ───────────────────────────────────────────────
  const [hoursDraft, setHoursDraft] = useState('');
  const [hoursError, setHoursError] = useState<string | null>(null);
  useEffect(() => {
    if (configQuery.data) setHoursDraft(String(configQuery.data.workingHoursPerDay));
  }, [configQuery.data]);

  // ── 4. Weekend rule ─────────────────────────────────────────────────────────
  const [weekendDraft, setWeekendDraft] = useState<WeekendRule>('SAT_SUN');
  useEffect(() => {
    if (configQuery.data) setWeekendDraft(configQuery.data.weekendRule);
  }, [configQuery.data]);

  // One mutation for the whole card. Previously each field had its own, all fired together by the
  // Save button — they raced on the single config row and the last response to land reverted the
  // others, so an edit only stuck on the second or third click.
  const timeAttendanceMutation = useMutation({
    mutationFn: updateTimeAttendance,
    onSuccess: () => {
      invalidateConfig();
      toast.showToast('success', 'Time & attendance updated');
      setHoursError(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update time & attendance.');
      setHoursError(msg);
      toast.showToast('error', msg);
    },
  });

  // The EOD cutoff used to live here as one global time-of-day. It is now set per shift as an
  // hours-after-shift-end offset, in the Shift Timings card below — a single time could not
  // express a deadline for a shift ending after midnight.

  // ── 6. Reminder lead time ───────────────────────────────────────────────────
  const [reminderDraft, setReminderDraft] = useState('');
  const [reminderError, setReminderError] = useState<string | null>(null);
  useEffect(() => {
    if (configQuery.data) setReminderDraft(String(configQuery.data.reminderLeadMinutes));
  }, [configQuery.data]);

  // ── 7. Escalation SLA ───────────────────────────────────────────────────────
  const [slaDraft, setSlaDraft] = useState('');
  const [slaError, setSlaError] = useState<string | null>(null);
  useEffect(() => {
    if (configQuery.data) setSlaDraft(String(configQuery.data.escalationSlaHours));
  }, [configQuery.data]);

  // ── 7b. Account Lockout ─────────────────────────────────────────────────────
  // Bounds mirror the server-side @Min/@Max on UpdateNotificationsRequest so an out-of-range
  // value is caught before the round trip.
  const [lockoutThresholdDraft, setLockoutThresholdDraft] = useState('');
  const [lockoutDurationDraft, setLockoutDurationDraft]   = useState('');
  const [lockoutError, setLockoutError] = useState<string | null>(null);
  useEffect(() => {
    if (configQuery.data) {
      setLockoutThresholdDraft(String(configQuery.data.lockoutAttemptThreshold));
      setLockoutDurationDraft(String(configQuery.data.lockoutDurationMinutes));
    }
  }, [configQuery.data]);

  // One mutation for the whole card — see timeAttendanceMutation for why per-field requests
  // could not save reliably.
  const notificationsMutation = useMutation({
    mutationFn: updateNotifications,
    onSuccess: () => {
      invalidateConfig();
      toast.showToast('success', 'Notifications & escalation updated');
      setReminderError(null); setSlaError(null); setLockoutError(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update notifications & escalation.');
      setLockoutError(msg);
      toast.showToast('error', msg);
    },
  });

  // ── 8. Time adjustment allowances ───────────────────────────────────────────
  // All three save together as one rule, matching how they are stored and audited.
  // Drafts stay null until the admin actually types, and the rendered value falls back to the
  // fetched config. That avoids an effect purely to copy server data into state — the sibling
  // rules above do use that idiom, but it needs no sync here.
  const [lateArrivalEdit, setLateArrivalEdit] = useState<string | null>(null);
  const [earlyLeaveEdit,  setEarlyLeaveEdit]  = useState<string | null>(null);
  const [interveningEdit, setInterveningEdit] = useState<string | null>(null);
  const [allowancesError, setAllowancesError] = useState<string | null>(null);

  const lateArrivalDraft = lateArrivalEdit
    ?? (configQuery.data ? String(configQuery.data.lateArrivalAllowance) : '');
  const earlyLeaveDraft  = earlyLeaveEdit
    ?? (configQuery.data ? String(configQuery.data.earlyLeaveAllowance) : '');
  const interveningDraft = interveningEdit
    ?? (configQuery.data ? String(configQuery.data.interveningAllowance) : '');
  const setLateArrivalDraft = setLateArrivalEdit;
  const setEarlyLeaveDraft  = setEarlyLeaveEdit;
  const setInterveningDraft = setInterveningEdit;

  const allowancesMutation = useMutation({
    mutationFn: updateAllowances,
    onSuccess: () => {
      invalidateConfig();
      toast.showToast('success', 'Time adjustment allowances updated');
      setAllowancesError(null);
      // Drop the local edits so the inputs read back from the freshly saved config.
      setLateArrivalEdit(null); setEarlyLeaveEdit(null); setInterveningEdit(null);
    },
    onError: (err) => {
      const msg = extractApiError(err, 'Failed to update time adjustment allowances.');
      setAllowancesError(msg);
      toast.showToast('error', msg);
    },
  });

  function saveAllowances() {
    const values = {
      lateArrivalAllowance: Number(lateArrivalDraft),
      earlyLeaveAllowance:  Number(earlyLeaveDraft),
      interveningAllowance: Number(interveningDraft),
    };
    // 0 is valid — it disables a type outright.
    const invalid = Object.values(values).some(v => !Number.isInteger(v) || v < 0 || v > 31);
    if (invalid) {
      setAllowancesError('Enter a whole number between 0 and 31 for each allowance.');
      return;
    }
    setAllowancesError(null);
    allowancesMutation.mutate(values);
  }

  // ── Grouped-card save handlers ──────────────────────────────────────────────
  // One request per card. Every field is validated first and the card is only submitted if all of
  // them pass: config is a single database row, so a partial save would write stale values over
  // the fields that were left out.

  function saveTimeAttendance() {
    const hoursPerDay = Number(hoursDraft);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
      setHoursError('Enter a number of hours between 0 and 24.');
      return;
    }
    setHoursError(null);
    timeAttendanceMutation.mutate({ hoursPerDay, weekendRule: weekendDraft });
  }
  const timeAttendancePending = timeAttendanceMutation.isPending;

  function saveNotifications() {
    const reminderLeadMinutes = Number(reminderDraft);
    const escalationSlaHours  = Number(slaDraft);
    const lockoutAttemptThreshold = Number(lockoutThresholdDraft);
    const lockoutDurationMinutes  = Number(lockoutDurationDraft);

    let invalid = false;
    if (!Number.isInteger(reminderLeadMinutes) || reminderLeadMinutes <= 0 || reminderLeadMinutes > 720) {
      setReminderError('Enter a whole number of minutes between 1 and 720.');
      invalid = true;
    } else setReminderError(null);

    if (!Number.isInteger(escalationSlaHours) || escalationSlaHours <= 0 || escalationSlaHours > 168) {
      setSlaError('Enter a whole number of hours between 1 and 168.');
      invalid = true;
    } else setSlaError(null);

    if (!Number.isInteger(lockoutAttemptThreshold) || lockoutAttemptThreshold < 3 || lockoutAttemptThreshold > 10) {
      setLockoutError('Enter a whole number of attempts between 3 and 10.');
      invalid = true;
    } else if (!Number.isInteger(lockoutDurationMinutes) || lockoutDurationMinutes < 1 || lockoutDurationMinutes > 1440) {
      setLockoutError('Enter a whole number of minutes between 1 and 1440.');
      invalid = true;
    } else setLockoutError(null);

    if (invalid) return;
    notificationsMutation.mutate({
      reminderLeadMinutes,
      escalationSlaHours,
      lockoutAttemptThreshold,
      lockoutDurationMinutes,
    });
  }
  const notificationsPending = notificationsMutation.isPending;

  // ── 2. Shift timings state ──────────────────────────────────────────────────
  const [shiftModal, setShiftModal] = useState<{ mode: 'create' } | { mode: 'edit'; shift: ShiftDefinitionDto } | null>(null);
  const [shiftFormError, setShiftFormError] = useState<string | null>(null);
  const [shiftFieldErrors, setShiftFieldErrors] = useState<Record<string, string>>({});
  const [deleteShiftItem, setDeleteShiftItem] = useState<ShiftDefinitionDto | null>(null);

  const createShiftMutation = useMutation({
    mutationFn: createShift,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'shifts'] });
      toast.showToast('success', `Shift "${result.name}" added`);
      setShiftModal(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) { setShiftFormError('A shift with this name already exists.'); return; }
      setShiftFieldErrors(extractFieldErrors(err));
      setShiftFormError(extractApiError(err, 'Failed to save shift.'));
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ShiftPayload }) =>
      updateShift(id, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'shifts'] });
      toast.showToast('success', `Shift "${result.name}" updated`);
      setShiftModal(null);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) { setShiftFormError('A shift with this name already exists.'); return; }
      setShiftFieldErrors(extractFieldErrors(err));
      setShiftFormError(extractApiError(err, 'Failed to save shift.'));
    },
  });

  const toggleShiftMutation = useMutation({
    mutationFn: toggleShift,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'shifts'] });
      toast.showToast('success', `"${result.name}" ${result.active ? 'activated' : 'deactivated'}`);
    },
    onError: (err) => toast.showToast('error', extractApiError(err, 'Failed to update shift.')),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: deleteShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'shifts'] });
      toast.showToast('success', `Shift "${deleteShiftItem?.name}" deleted`);
      setDeleteShiftItem(null);
    },
    onError: (err) => toast.showToast('error', extractApiError(err, 'Failed to delete shift.')),
  });

  // ── 3. Holiday calendar state ───────────────────────────────────────────────
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayFormError, setHolidayFormError] = useState<string | null>(null);
  const [holidayFieldErrors, setHolidayFieldErrors] = useState<Record<string, string>>({});
  const [deleteHolidayItem, setDeleteHolidayItem] = useState<HolidayDto | null>(null);

  const createHolidayMutation = useMutation({
    mutationFn: createHoliday,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'holidays'] });
      toast.showToast('success', `Holiday "${result.name}" added`);
      setHolidayModalOpen(false);
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) { setHolidayFormError('A holiday is already defined on this date.'); return; }
      setHolidayFieldErrors(extractFieldErrors(err));
      setHolidayFormError(extractApiError(err, 'Failed to add holiday.'));
    },
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: deleteHoliday,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules', 'holidays'] });
      toast.showToast('success', `Holiday "${deleteHolidayItem?.name}" removed`);
      setDeleteHolidayItem(null);
    },
    onError: (err) => toast.showToast('error', extractApiError(err, 'Failed to remove holiday.')),
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 24, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          Business Rules
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Working hours, calendars, cutoffs and escalation policy. New rules apply forward
          only — past periods are not re-flagged.
        </p>
      </div>

      {/* Time & Attendance — working hours + weekend rule, one Save for both */}
      <RuleCard
        title="Time & Attendance"
        description="Standard working hours and which days count as weekend."
        icon={<Clock size={16} aria-hidden="true" />}
        accent="var(--info)"
        footer={<LastUpdatedCaption info={timeAttendanceUpdate} />}
      >
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ maxWidth: 160 }}>
            <label style={labelStyle} htmlFor="working-hours-input">Hours per day</label>
            <UnitField unit="hrs/day">
              <input
                id="working-hours-input"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={hoursDraft}
                onChange={(e) => setHoursDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 52 }}
              />
            </UnitField>
            <FieldError msg={hoursError ?? undefined} />
          </div>
          <div>
            <label style={labelStyle}>Weekend rule</label>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 9 }}>
              {WEEKEND_OPTIONS.map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="weekend-rule"
                    checked={weekendDraft === opt.value}
                    onChange={() => setWeekendDraft(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={saveTimeAttendance}
          disabled={timeAttendancePending || configQuery.isPending}
          style={{ ...primaryButtonStyle, opacity: timeAttendancePending ? 0.7 : 1 }}
        >
          {timeAttendancePending ? 'Saving…' : 'Save'}
        </button>
      </RuleCard>

      {/* Notifications & Escalation — reminder lead time + SLA, one Save for both. The EOD cutoff
          moved to the Shift Timings card, as hours after each shift's end. */}
      <RuleCard
        title="Notifications & Escalation"
        description="Reminder timing, how long an unapproved submission waits before escalating, and the sign-in lockout applied after repeated failed attempts. The EOD cutoff is set per shift below."
        icon={<Bell size={16} aria-hidden="true" />}
        accent="var(--warn)"
        footer={<LastUpdatedCaption info={notificationsUpdate} />}
      >
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="reminder-input">Reminder lead time</label>
            <UnitField unit="min">
              <input
                id="reminder-input"
                type="number"
                min={1}
                max={720}
                step={1}
                value={reminderDraft}
                onChange={(e) => setReminderDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
              />
            </UnitField>
            <FieldError msg={reminderError ?? undefined} />
          </div>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="sla-input">Escalation SLA</label>
            <UnitField unit="hrs">
              <input
                id="sla-input"
                type="number"
                min={1}
                max={168}
                step={1}
                value={slaDraft}
                onChange={(e) => setSlaDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
              />
            </UnitField>
            <FieldError msg={slaError ?? undefined} />
          </div>
          {/* Account Lockout — how many consecutive failed sign-ins lock an account, and for
              how long. Enforced per account by the backend on every sign-in attempt. */}
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="lockout-threshold-input">Lock account after</label>
            <UnitField unit="tries">
              <input
                id="lockout-threshold-input"
                type="number"
                min={3}
                max={10}
                step={1}
                value={lockoutThresholdDraft}
                onChange={(e) => setLockoutThresholdDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 48 }}
              />
            </UnitField>
          </div>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="lockout-duration-input">Lockout duration</label>
            <UnitField unit="min">
              <input
                id="lockout-duration-input"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={lockoutDurationDraft}
                onChange={(e) => setLockoutDurationDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
              />
            </UnitField>
          </div>
        </div>
        <FieldError msg={lockoutError ?? undefined} />
        <button
          onClick={saveNotifications}
          disabled={notificationsPending || configQuery.isPending}
          style={{ ...primaryButtonStyle, opacity: notificationsPending ? 0.7 : 1 }}
        >
          {notificationsPending ? 'Saving…' : 'Save'}
        </button>
      </RuleCard>

      {/* Time adjustment allowances — how MANY times per month each type may be used.
          The per-use duration limit (30–120 min) is a fixed policy enforced in EodService. */}
      <RuleCard
        title="Time Adjustment Allowances"
        description="How many times per calendar month an employee may request each type of time adjustment. Applies to everyone — there are no per-role or per-department overrides."
        icon={<Clock3 size={16} aria-hidden="true" />}
        accent="var(--info)"
        footer={<LastUpdatedCaption info={allowancesUpdate} />}
      >
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="late-arrival-allowance">Late arrival</label>
            <UnitField unit="/mo">
              <input
                id="late-arrival-allowance"
                type="number"
                min={0}
                max={31}
                step={1}
                value={lateArrivalDraft}
                onChange={(e) => setLateArrivalDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
            </UnitField>
          </div>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="intervening-allowance">Intervening time-off</label>
            <UnitField unit="/mo">
              <input
                id="intervening-allowance"
                type="number"
                min={0}
                max={31}
                step={1}
                value={interveningDraft}
                onChange={(e) => setInterveningDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
            </UnitField>
          </div>
          <div style={{ minWidth: 160 }}>
            <label style={labelStyle} htmlFor="early-leave-allowance">Leaving early</label>
            <UnitField unit="/mo">
              <input
                id="early-leave-allowance"
                type="number"
                min={0}
                max={31}
                step={1}
                value={earlyLeaveDraft}
                onChange={(e) => setEarlyLeaveDraft(e.target.value)}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
            </UnitField>
          </div>
        </div>
        <FieldError msg={allowancesError ?? undefined} />
        <button
          onClick={saveAllowances}
          disabled={allowancesMutation.isPending || configQuery.isPending}
          style={{ ...primaryButtonStyle, opacity: allowancesMutation.isPending ? 0.7 : 1 }}
        >
          {allowancesMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </RuleCard>

      {/* Shift timings */}
      <RuleCard
        title="Shift Timings"
        description="Shift options available for assignment to employees in User Management."
        icon={<CalendarClock size={16} aria-hidden="true" />}
        accent="var(--ok)"
        footer={<LastUpdatedCaption info={shiftsUpdate} />}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => { setShiftFormError(null); setShiftFieldErrors({}); setShiftModal({ mode: 'create' }); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, ...primaryButtonStyle }}
          >
            <Plus size={13} aria-hidden="true" /> Add Shift
          </button>
        </div>
        <ShiftTable
          data={shiftsQuery.data}
          isPending={shiftsQuery.isPending}
          isError={shiftsQuery.isError}
          onEdit={(shift) => { setShiftFormError(null); setShiftFieldErrors({}); setShiftModal({ mode: 'edit', shift }); }}
          onToggle={(shift) => toggleShiftMutation.mutate(shift.id)}
          isTogglePending={toggleShiftMutation.isPending}
          onDelete={(shift) => setDeleteShiftItem(shift)}
        />
      </RuleCard>

      {/* Holiday calendar */}
      <RuleCard
        title="Holiday Calendar"
        description="Dated holiday entries excluded from working-day calculations."
        icon={<CalendarDays size={16} aria-hidden="true" />}
        accent="var(--risk)"
        footer={<LastUpdatedCaption info={holidaysUpdate} />}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => { setHolidayFormError(null); setHolidayFieldErrors({}); setHolidayModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, ...primaryButtonStyle }}
          >
            <Plus size={13} aria-hidden="true" /> Add Holiday
          </button>
        </div>
        <HolidayTable
          data={holidaysQuery.data}
          isPending={holidaysQuery.isPending}
          isError={holidaysQuery.isError}
          onDelete={(holiday) => setDeleteHolidayItem(holiday)}
        />
      </RuleCard>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <ShiftFormModal
        state={shiftModal}
        onClose={() => setShiftModal(null)}
        onSubmit={(payload) => {
          if (!shiftModal) return;
          if (shiftModal.mode === 'create') createShiftMutation.mutate(payload);
          else updateShiftMutation.mutate({ id: shiftModal.shift.id, payload });
        }}
        isPending={createShiftMutation.isPending || updateShiftMutation.isPending}
        error={shiftFormError}
        fieldErrors={shiftFieldErrors}
      />

      <ConfirmModal
        open={deleteShiftItem != null}
        onClose={() => setDeleteShiftItem(null)}
        onConfirm={() => { if (deleteShiftItem) deleteShiftMutation.mutate(deleteShiftItem.id); }}
        title="Delete Shift"
        message={
          <>
            Delete shift <b style={{ color: 'var(--txt)' }}>{deleteShiftItem?.name}</b>?
            {' '}
            {deleteShiftItem && deleteShiftItem.assignedEmployeeCount > 0 ? (
              <>
                This shift is assigned to <b style={{ color: 'var(--txt)' }}>
                  {deleteShiftItem.assignedEmployeeCount} employee{deleteShiftItem.assignedEmployeeCount === 1 ? '' : 's'}
                </b> — deleting it will not reassign them, they'll keep referencing a shift that no longer exists in this list.
              </>
            ) : (
              <>No employees are currently assigned to this shift.</>
            )}
          </>
        }
        confirmLabel="Delete"
        isPending={deleteShiftMutation.isPending}
      />

      <HolidayFormModal
        open={holidayModalOpen}
        onClose={() => setHolidayModalOpen(false)}
        onSubmit={(payload) => createHolidayMutation.mutate(payload)}
        isPending={createHolidayMutation.isPending}
        error={holidayFormError}
        fieldErrors={holidayFieldErrors}
      />

      <ConfirmModal
        open={deleteHolidayItem != null}
        onClose={() => setDeleteHolidayItem(null)}
        onConfirm={() => { if (deleteHolidayItem) deleteHolidayMutation.mutate(deleteHolidayItem.id); }}
        title="Remove Holiday"
        message={<>Remove <b style={{ color: 'var(--txt)' }}>{deleteHolidayItem?.name}</b> from the holiday calendar?</>}
        confirmLabel="Remove"
        isPending={deleteHolidayMutation.isPending}
      />
    </div>
  );
}

// ── Shift table ──────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)',
  textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase',
  background: 'var(--raised)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--line)' };

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: active ? 'rgba(47,182,124,.12)' : 'rgba(107,114,128,.12)',
      border: `1px solid ${active ? 'rgba(47,182,124,.3)' : 'rgba(107,114,128,.3)'}`,
      color: active ? 'var(--ok)' : 'var(--txt-mut)',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

interface ShiftTableProps {
  data: ShiftDefinitionDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  onEdit: (shift: ShiftDefinitionDto) => void;
  onToggle: (shift: ShiftDefinitionDto) => void;
  isTogglePending: boolean;
  onDelete: (shift: ShiftDefinitionDto) => void;
}

function ShiftTable({ data, isPending, isError, onEdit, onToggle, isTogglePending, onDelete }: ShiftTableProps) {
  return (
    <div style={{ background: 'var(--shell)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(2)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />)}
        </div>
      )}
      {isError && <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--risk)' }}>Failed to load shifts.</div>}
      {data && (
        <div className="nf-r-scroll">
        <table className="nf-r-scroll-inner" style={{ width: '100%', borderCollapse: 'collapse', '--nf-r-min': '720px' } as React.CSSProperties}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Timing</th>
              <th style={thStyle}>EOD cutoff</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '30px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>No shifts defined yet.</td></tr>
            ) : data.map((shift) => (
              <tr key={shift.id}>
                <td style={tdStyle}><span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{shift.name}</span></td>
                <td style={tdStyle}><span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>{formatTime12h(shift.startTime)} – {formatTime12h(shift.endTime)}</span></td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 13, color: shift.eodCutoffHours == null ? 'var(--txt-dim)' : 'var(--txt-mut)' }}
                        title={shift.eodCutoffHours == null ? 'No deadline — no reminder is sent for this shift.' : undefined}>
                    {cutoffLabel(shift.startTime, shift.endTime, shift.eodCutoffHours)}
                  </span>
                </td>
                <td style={tdStyle}><ActiveBadge active={shift.active} /></td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => onEdit(shift)} style={secondaryButtonStyle}>Edit</button>
                    <button
                      onClick={() => onToggle(shift)}
                      disabled={isTogglePending}
                      style={{
                        ...secondaryButtonStyle,
                        color: shift.active ? 'var(--risk)' : 'var(--ok)',
                        borderColor: shift.active ? 'rgba(228,55,61,.3)' : 'rgba(47,182,124,.3)',
                        cursor: isTogglePending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {shift.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => onDelete(shift)} style={dangerButtonStyle}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ── Holiday table ────────────────────────────────────────────────────────────

interface HolidayTableProps {
  data: HolidayDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  onDelete: (holiday: HolidayDto) => void;
}

function HolidayTable({ data, isPending, isError, onDelete }: HolidayTableProps) {
  return (
    <div style={{ background: 'var(--shell)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(2)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />)}
        </div>
      )}
      {isError && <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--risk)' }}>Failed to load holidays.</div>}
      {data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Date</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '30px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>No holidays added yet.</td></tr>
            ) : data.map((holiday) => (
              <tr key={holiday.id}>
                <td style={tdStyle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                    <CalendarDays size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
                    {holiday.name}
                  </span>
                </td>
                <td style={tdStyle}><span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>{formatDate(holiday.holidayDate)}</span></td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button onClick={() => onDelete(holiday)} style={dangerButtonStyle}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Shift add/edit modal (uses Modal's sticky footer) ───────────────────────

type ShiftModalState = { mode: 'create' } | { mode: 'edit'; shift: ShiftDefinitionDto } | null;

interface ShiftFormModalProps {
  state: ShiftModalState;
  onClose: () => void;
  onSubmit: (payload: { name: string; startTime: string; endTime: string; eodCutoffHours: number | null }) => void;
  isPending: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

function ShiftFormModal({ state, onClose, onSubmit, isPending, error, fieldErrors }: ShiftFormModalProps) {
  const nameId = useId();
  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [cutoff, setCutoff] = useState('');

  useEffect(() => {
    if (state?.mode === 'edit') {
      setName(state.shift.name);
      setStart(toHm(state.shift.startTime));
      setEnd(toHm(state.shift.endTime));
      setCutoff(state.shift.eodCutoffHours == null ? '' : String(state.shift.eodCutoffHours));
    } else if (state?.mode === 'create') {
      setName(''); setStart('09:00'); setEnd('18:00'); setCutoff('');
    }
  }, [state]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !start || !end) return;
    // Blank is a deliberate value, not a zero: it means "no deadline for this shift".
    const trimmed = cutoff.trim();
    onSubmit({
      name: name.trim(),
      startTime: `${start}:00`,
      endTime: `${end}:00`,
      eodCutoffHours: trimmed === '' ? null : Number(trimmed),
    });
  }

  return (
    <Modal
      open={state != null}
      title={state?.mode === 'edit' ? 'Edit Shift' : 'Add Shift'}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="submit" form="shift-form" disabled={isPending || !name.trim()} style={{ ...primaryButtonStyle, opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <form id="shift-form" onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor={nameId}>Shift Name *</label>
          <input id={nameId} type="text" placeholder="e.g. General" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} autoFocus />
          <FieldError msg={fieldErrors.name} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="shift-start">Start Time *</label>
            <input id="shift-start" type="time" lang="en-US" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
            <FieldError msg={fieldErrors.startTime} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="shift-end">End Time *</label>
            <input id="shift-end" type="time" lang="en-US" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
            <FieldError msg={fieldErrors.endTime} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle} htmlFor="shift-cutoff">EOD cutoff</label>
          <UnitField unit="hrs after end">
            <input
              id="shift-cutoff"
              type="number"
              min={0}
              max={24}
              step={0.5}
              placeholder="e.g. 3"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              style={{ ...inputStyle, paddingRight: 96 }}
            />
          </UnitField>
          <FieldError msg={fieldErrors.eodCutoffHours} />
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', margin: '6px 0 0' }}>
            {cutoff.trim() === ''
              ? 'Leave blank for no deadline — no reminder will be sent for this shift.'
              : `EOD due ${cutoffLabel(`${start}:00`, `${end}:00`, Number(cutoff))}. A reminder is sent once it passes.`}
          </p>
        </div>
      </form>
    </Modal>
  );
}

// ── Holiday add modal (uses Modal's sticky footer) ──────────────────────────

interface HolidayFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; holidayDate: string }) => void;
  isPending: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

function HolidayFormModal({ open, onClose, onSubmit, isPending, error, fieldErrors }: HolidayFormModalProps) {
  const nameId = useId();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => { if (open) { setName(''); setDate(''); } }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;
    onSubmit({ name: name.trim(), holidayDate: date });
  }

  return (
    <Modal
      open={open}
      title="Add Holiday"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="submit" form="holiday-form" disabled={isPending || !name.trim() || !date} style={{ ...primaryButtonStyle, opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
            {isPending ? 'Adding…' : 'Add'}
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <form id="holiday-form" onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor={nameId}>Holiday Name *</label>
          <input id={nameId} type="text" placeholder="e.g. Independence Day" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} autoFocus />
          <FieldError msg={fieldErrors.name} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="holiday-date">Date *</label>
          <input id="holiday-date" type="date" lang="en-GB" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          <FieldError msg={fieldErrors.holidayDate} />
        </div>
      </form>
    </Modal>
  );
}

// ── Generic confirm modal ────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  isPending?: boolean;
}

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, isPending = false }: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{
              padding: '9px 20px', background: 'rgba(228,55,61,.15)', border: '1px solid rgba(228,55,61,.4)',
              borderRadius: 7, color: 'var(--risk)', fontSize: 13, fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
          <button onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.7 }}>{message}</div>
    </Modal>
  );
}
