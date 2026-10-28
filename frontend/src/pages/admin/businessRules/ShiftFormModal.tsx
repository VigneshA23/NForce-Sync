import { useEffect, useId, useRef, useState } from 'react';
import type { ShiftDefinitionDto } from '../../../api/businessRules';
import { Modal } from '../../../components/Modal';
import { TimeStepperInput } from '../../../components/TimeStepperInput';
import { focusFirstInvalid } from '../../../lib/formFocus';
import { capitalizeFirst } from '../../../lib/strings';
import { validateShift } from './businessRulesValidation';
import type { ShiftField } from './businessRulesValidation';
import { ErrorBanner, FieldError, UnitField } from './formParts';
import {
  inputStyle, invalidBorder, labelStyle, primaryButtonStyle, secondaryButtonStyle,
} from './formStyles';
import { cutoffLabel, toHm } from './shiftTime';

// Add and Edit Shift share this one form. The mutations stay in the page; this only collects and checks the values.
// Errors appear after the first submit attempt (so an untouched form isn't red on open) and from then on follow
// the field live: fixing a field clears its message at once. A server error (duplicate name, ...) clears the same way.

export type ShiftModalState = { mode: 'create' } | { mode: 'edit'; shift: ShiftDefinitionDto } | null;

export interface ShiftFormPayload {
  name: string;
  startTime: string;
  endTime: string;
  eodCutoffHours: number | null;
}

interface ShiftFormModalProps {
  state: ShiftModalState;
  onClose: () => void;
  onSubmit: (payload: ShiftFormPayload) => void;
  isPending: boolean;
  /** A failure that could not be pinned to a field. */
  error: string | null;
  /** Server messages by field (name, startTime, endTime, eodCutoffHours). */
  fieldErrors: Record<string, string>;
}

export function ShiftFormModal({ state, onClose, onSubmit, isPending, error, fieldErrors }: ShiftFormModalProps) {
  const uid = useId();
  const ids = { name: `${uid}-name`, end: `${uid}-end-error`, start: `${uid}-start-error`, cutoff: `${uid}-cutoff` };
  const nameErrorId = `${ids.name}-error`;
  const cutoffErrorId = `${ids.cutoff}-error`;
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [cutoff, setCutoff] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  // Server messages the user has already started fixing, tied to the fieldErrors object they were dismissed from.
  const [dismissed, setDismissed] = useState<{ source: Record<string, string>; keys: string[] }>({ source: fieldErrors, keys: [] });

  // Re-seed whenever the modal is opened (a new `state`): the same effect the old useEffect had, without the extra render.
  const [seenState, setSeenState] = useState<ShiftModalState>(null);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.mode === 'edit') {
      setName(state.shift.name);
      setStart(toHm(state.shift.startTime));
      setEnd(toHm(state.shift.endTime));
      setCutoff(state.shift.eodCutoffHours == null ? '' : String(state.shift.eodCutoffHours));
      setSubmitted(false);
    } else if (state?.mode === 'create') {
      setName(''); setStart('09:00'); setEnd('18:00'); setCutoff('');
      setSubmitted(false);
    }
  }

  const clientErrors = submitted ? validateShift({ name, start, end, cutoff }) : {};
  const serverErrors: Partial<Record<ShiftField, string>> = {};
  for (const [field, msg] of Object.entries(fieldErrors)) {
    if (dismissed.source === fieldErrors && dismissed.keys.includes(field)) continue;
    serverErrors[field as ShiftField] = msg;
  }
  const errors: Partial<Record<ShiftField, string>> = { ...serverErrors, ...clientErrors };
  const hasServerFieldError = Object.keys(serverErrors).length > 0;

  // After the render that shows the errors, send focus to the first invalid field.
  useEffect(() => {
    if (focusTick > 0 || hasServerFieldError) focusFirstInvalid(formRef.current);
  }, [focusTick, fieldErrors, hasServerFieldError]);

  function dismissServer(field: ShiftField) {
    setDismissed((d) => ({ source: fieldErrors, keys: d.source === fieldErrors ? [...d.keys, field] : [field] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return; // no double submit
    setSubmitted(true);
    if (Object.keys(validateShift({ name, start, end, cutoff })).length > 0) {
      setFocusTick((t) => t + 1);
      return;
    }
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
          <button
            type="submit"
            form="shift-form"
            disabled={isPending}
            aria-busy={isPending}
            style={{ ...primaryButtonStyle, opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <form id="shift-form" ref={formRef} onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor={ids.name}>Shift Name *</label>
          <input
            id={ids.name}
            type="text"
            placeholder="e.g. General"
            value={name}
            onChange={(e) => { setName(capitalizeFirst(e.target.value)); dismissServer('name'); }}
            aria-required="true"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? nameErrorId : undefined}
            style={{ ...inputStyle, ...(errors.name ? invalidBorder : null) }}
            autoFocus
          />
          <FieldError id={nameErrorId} msg={errors.name} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle} id="shift-start-label">Start Time *</label>
            <TimeStepperInput
              id="shift-start" label="Start time" value={start}
              onChange={(v) => { setStart(v); dismissServer('startTime'); }}
              compact invalid={!!errors.startTime} errorId={ids.start}
            />
            <FieldError id={ids.start} msg={errors.startTime} />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle} id="shift-end-label">End Time *</label>
            <TimeStepperInput
              id="shift-end" label="End time" value={end}
              onChange={(v) => { setEnd(v); dismissServer('endTime'); }}
              compact invalid={!!errors.endTime} errorId={ids.end}
            />
            <FieldError id={ids.end} msg={errors.endTime} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={labelStyle} htmlFor={ids.cutoff}>EOD cutoff</label>
          <UnitField unit="hrs after end">
            <input
              id={ids.cutoff}
              type="number"
              min={0}
              max={24}
              step={0.5}
              placeholder="e.g. 3"
              value={cutoff}
              onChange={(e) => { setCutoff(e.target.value); dismissServer('eodCutoffHours'); }}
              aria-invalid={errors.eodCutoffHours ? true : undefined}
              aria-describedby={errors.eodCutoffHours ? cutoffErrorId : undefined}
              style={{ ...inputStyle, paddingRight: 96, ...(errors.eodCutoffHours ? invalidBorder : null) }}
            />
          </UnitField>
          <FieldError id={cutoffErrorId} msg={errors.eodCutoffHours} />
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', margin: '6px 0 0' }}>
            {cutoff.trim() === ''
              ? 'Leave blank for no deadline, so no reminder will be sent for this shift.'
              : `EOD due ${cutoffLabel(`${start}:00`, `${end}:00`, Number(cutoff))}. A reminder is sent once it passes.`}
          </p>
        </div>
      </form>
    </Modal>
  );
}
