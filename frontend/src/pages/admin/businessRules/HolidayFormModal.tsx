import { useEffect, useId, useRef, useState } from 'react';
import type { HolidayDto } from '../../../api/businessRules';
import { Modal } from '../../../components/Modal';
import { focusFirstInvalid } from '../../../lib/formFocus';
import { capitalizeFirst } from '../../../lib/strings';
import { validateHoliday } from './businessRulesValidation';
import type { HolidayField } from './businessRulesValidation';
import { ErrorBanner, FieldError } from './formParts';
import {
  inputStyle, invalidBorder, labelStyle, primaryButtonStyle, secondaryButtonStyle,
} from './formStyles';

// Add and Edit Holiday share this one form. The mutations stay in the page; this only collects and checks the values.
// Same behaviour as the Shift form: errors appear after the first submit attempt and then follow the field live, and a
// server error (a holiday already on that date, ...) sits under its field until that field is edited.

export type HolidayModalState = { mode: 'create' } | { mode: 'edit'; holiday: HolidayDto } | null;

export interface HolidayFormPayload {
  name: string;
  holidayDate: string;
}

interface HolidayFormModalProps {
  state: HolidayModalState;
  onClose: () => void;
  onSubmit: (payload: HolidayFormPayload) => void;
  isPending: boolean;
  /** A failure that could not be pinned to a field. */
  error: string | null;
  /** Server messages by field (name, holidayDate). */
  fieldErrors: Record<string, string>;
}

export function HolidayFormModal({ state, onClose, onSubmit, isPending, error, fieldErrors }: HolidayFormModalProps) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const dateId = `${uid}-date`;
  const nameErrorId = `${nameId}-error`;
  const dateErrorId = `${dateId}-error`;
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  // <input type="date"> reports "" both when empty and when half-typed; validity.badInput tells the two apart.
  const [dateBadInput, setDateBadInput] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [dismissed, setDismissed] = useState<{ source: Record<string, string>; keys: string[] }>({ source: fieldErrors, keys: [] });

  // Re-seed whenever the modal is opened (a new `state`).
  const [seenState, setSeenState] = useState<HolidayModalState>(null);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.mode === 'edit') {
      setName(state.holiday.name);
      setDate(state.holiday.holidayDate);
      setDateBadInput(false);
      setSubmitted(false);
    } else if (state?.mode === 'create') {
      setName(''); setDate(''); setDateBadInput(false);
      setSubmitted(false);
    }
  }

  const clientErrors = submitted ? validateHoliday({ name, date, dateBadInput }) : {};
  const serverErrors: Partial<Record<HolidayField, string>> = {};
  for (const [field, msg] of Object.entries(fieldErrors)) {
    if (dismissed.source === fieldErrors && dismissed.keys.includes(field)) continue;
    serverErrors[field as HolidayField] = msg;
  }
  const errors: Partial<Record<HolidayField, string>> = { ...serverErrors, ...clientErrors };
  const hasServerFieldError = Object.keys(serverErrors).length > 0;

  // After the render that shows the errors, send focus to the first invalid field.
  useEffect(() => {
    if (focusTick > 0 || hasServerFieldError) focusFirstInvalid(formRef.current);
  }, [focusTick, fieldErrors, hasServerFieldError]);

  function dismissServer(field: HolidayField) {
    setDismissed((d) => ({ source: fieldErrors, keys: d.source === fieldErrors ? [...d.keys, field] : [field] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return; // no double submit
    setSubmitted(true);
    // Read it from the input itself: a half-typed date leaves the value at "", so React sees no change and no onChange fires.
    const badInput = dateRef.current?.validity.badInput ?? dateBadInput;
    setDateBadInput(badInput);
    if (Object.keys(validateHoliday({ name, date, dateBadInput: badInput })).length > 0) {
      setFocusTick((t) => t + 1);
      return;
    }
    onSubmit({ name: name.trim(), holidayDate: date });
  }

  return (
    <Modal
      open={state != null}
      title={state?.mode === 'edit' ? 'Edit Holiday' : 'Add Holiday'}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button
            type="submit"
            form="holiday-form"
            disabled={isPending}
            aria-busy={isPending}
            style={{ ...primaryButtonStyle, opacity: isPending ? 0.7 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? 'Saving…' : state?.mode === 'edit' ? 'Save' : 'Add'}
          </button>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Cancel</button>
        </>
      }
    >
      <form id="holiday-form" ref={formRef} onSubmit={handleSubmit} noValidate>
        {error && <ErrorBanner message={error} />}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle} htmlFor={nameId}>Holiday Name *</label>
          <input
            id={nameId}
            type="text"
            placeholder="e.g. Independence Day"
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
        <div>
          <label style={labelStyle} htmlFor={dateId}>Date *</label>
          <input
            id={dateId}
            ref={dateRef}
            type="date"
            lang="en-GB"
            value={date}
            onChange={(e) => { setDate(e.target.value); setDateBadInput(e.target.validity.badInput); dismissServer('holidayDate'); }}
            onBlur={(e) => setDateBadInput(e.target.validity.badInput)}
            aria-required="true"
            aria-invalid={errors.holidayDate ? true : undefined}
            aria-describedby={errors.holidayDate ? dateErrorId : undefined}
            style={{ ...inputStyle, ...(errors.holidayDate ? invalidBorder : null) }}
          />
          <FieldError id={dateErrorId} msg={errors.holidayDate} />
        </div>
      </form>
    </Modal>
  );
}
