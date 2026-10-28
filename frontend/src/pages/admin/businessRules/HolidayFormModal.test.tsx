// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HolidayDto } from '../../../api/businessRules';
import { MAX_HOLIDAY_NAME } from './businessRulesValidation';
import { HolidayFormModal } from './HolidayFormModal';
import type { HolidayModalState } from './HolidayFormModal';

afterEach(cleanup);

const CREATE: HolidayModalState = { mode: 'create' };
const holiday = (over: Partial<HolidayDto> = {}): HolidayDto => ({ id: 3, name: 'Independence Day', holidayDate: '2026-08-15', ...over });

function setup(props: Partial<React.ComponentProps<typeof HolidayFormModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <HolidayFormModal state={CREATE} onClose={onClose} onSubmit={onSubmit} isPending={false} error={null}
      fieldErrors={{}} {...props} />,
  );
  return { onSubmit, onClose, ...utils };
}

const nameInput = () => screen.getByLabelText(/Holiday Name/i) as HTMLInputElement;
const dateInput = () => screen.getByLabelText(/^Date/i) as HTMLInputElement;
const submitButton = (label = 'Add') => screen.getByRole('button', { name: new RegExp(`^(${label}|Saving…)$`) }) as HTMLButtonElement;
const typeName = (v: string) => fireEvent.change(nameInput(), { target: { value: v } });
const pickDate = (v: string) => fireEvent.change(dateInput(), { target: { value: v } });
const alertTexts = () => screen.queryAllByRole('alert').map(a => a.textContent);

describe('Add Holiday', () => {
  it('shows nothing wrong on first render, and an enabled Add button', () => {
    setup();
    expect(alertTexts()).toEqual([]);
    expect(nameInput().getAttribute('aria-invalid')).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('marks the required fields with an asterisk', () => {
    setup();
    expect(screen.getByText('Holiday Name *')).toBeTruthy();
    expect(screen.getByText('Date *')).toBeTruthy();
  });

  it('empty submit: an error under each required field, no API call, focus on the first, accessible wiring', () => {
    const { onSubmit } = setup();
    fireEvent.click(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Holiday name is required.', 'Date is required.']);
    for (const input of [nameInput(), dateInput()]) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const el = document.getElementById(input.getAttribute('aria-describedby')!);
      expect(el).not.toBeNull();
    }
    expect(document.activeElement).toBe(nameInput());
  });

  it('whitespace-only name counts as empty', () => {
    const { onSubmit } = setup();
    typeName('    ');
    pickDate('2026-08-15');
    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Holiday name is required.']);
  });

  it('partly filled: fixing one field clears only that error, live', () => {
    setup();
    fireEvent.click(submitButton());
    expect(alertTexts()).toEqual(['Holiday name is required.', 'Date is required.']);

    typeName('Diwali');
    expect(alertTexts()).toEqual(['Date is required.']);
    pickDate('2026-11-08');
    expect(alertTexts()).toEqual([]);
  });

  it('only the date missing: focus goes to the date', () => {
    setup();
    typeName('Diwali');
    fireEvent.click(submitButton());
    expect(alertTexts()).toEqual(['Date is required.']);
    expect(document.activeElement).toBe(dateInput());
  });

  it('name over the maximum length is rejected with the limit named', () => {
    const { onSubmit } = setup();
    typeName('a'.repeat(MAX_HOLIDAY_NAME + 1));
    pickDate('2026-08-15');
    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual([`Holiday name must be ${MAX_HOLIDAY_NAME} characters or fewer.`]);
  });

  it('a malformed date (the input reports bad text) says "Enter a valid date."', () => {
    const { onSubmit } = setup();
    typeName('Diwali');
    // Half-typed: the value stays '' so no change event fires; the form reads the input's own validity on submit.
    Object.defineProperty(dateInput(), 'validity', { value: { badInput: true }, configurable: true });
    fireEvent.click(submitButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Enter a valid date.']);
  });

  it('valid submit sends the trimmed name and the date', () => {
    const { onSubmit } = setup();
    typeName('  Independence Day  ');
    pickDate('2026-08-15');
    fireEvent.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Independence Day', holidayDate: '2026-08-15' });
    expect(alertTexts()).toEqual([]);
  });

  it('Enter in the name field submits (and shows the errors when it is empty)', () => {
    const { onSubmit } = setup();
    fireEvent.submit(nameInput().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Holiday name is required.', 'Date is required.']);
  });

  it('server duplicate date: inline under the date in the backend\'s words, no banner, cleared by editing the date', () => {
    const msg = 'A holiday is already defined on this date';
    setup({ fieldErrors: { holidayDate: msg } });
    expect(alertTexts()).toEqual([msg]);
    expect(dateInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(dateInput());

    pickDate('2026-08-16');
    expect(alertTexts()).toEqual([]);
    expect(dateInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('a server error on the name stays until the name is edited', () => {
    setup({ fieldErrors: { name: 'size must be between 0 and 200' } });
    expect(alertTexts()).toEqual(['size must be between 0 and 200']);
    typeName('Diwali');
    expect(alertTexts()).toEqual([]);
  });

  it('a failure that cannot be pinned to a field shows as one banner', () => {
    setup({ error: 'Failed to add holiday.' });
    expect(alertTexts()).toEqual(['Failed to add holiday.']);
  });

  it('pending: the button is disabled, says Saving…, and a second submit is ignored', () => {
    const { onSubmit } = setup({ isPending: true });
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toBe('Saving…');
    typeName('Diwali');
    pickDate('2026-11-08');
    fireEvent.submit(nameInput().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Cancel closes without submitting', () => {
    const { onClose, onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Edit Holiday (same form)', () => {
  it('opens pre-filled, and the button says Save', () => {
    setup({ state: { mode: 'edit', holiday: holiday() } });
    expect(screen.getByText('Edit Holiday')).toBeTruthy();
    expect(nameInput().value).toBe('Independence Day');
    expect(dateInput().value).toBe('2026-08-15');
    expect(submitButton('Save')).toBeTruthy();
  });

  it('clearing the name and saving shows the same error and does not submit', () => {
    const { onSubmit } = setup({ state: { mode: 'edit', holiday: holiday() } });
    typeName('   ');
    fireEvent.click(submitButton('Save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Holiday name is required.']);
  });

  it('a valid edit submits the trimmed name', () => {
    const { onSubmit } = setup({ state: { mode: 'edit', holiday: holiday() } });
    typeName(' Republic Day ');
    fireEvent.click(submitButton('Save'));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Republic Day', holidayDate: '2026-08-15' });
  });
});
