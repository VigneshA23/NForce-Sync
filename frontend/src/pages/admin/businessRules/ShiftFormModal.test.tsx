// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ShiftDefinitionDto } from '../../../api/businessRules';
import { MAX_SHIFT_NAME } from './businessRulesValidation';
import { ShiftFormModal } from './ShiftFormModal';
import type { ShiftModalState } from './ShiftFormModal';

afterEach(cleanup);

const CREATE: ShiftModalState = { mode: 'create' };
const shift = (over: Partial<ShiftDefinitionDto> = {}): ShiftDefinitionDto => ({
  id: 7, name: 'General', startTime: '09:00:00', endTime: '18:00:00', eodCutoffHours: null, active: true,
  assignedEmployeeCount: 0, ...over,
});

function setup(props: Partial<React.ComponentProps<typeof ShiftFormModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ShiftFormModal state={CREATE} onClose={onClose} onSubmit={onSubmit} isPending={false} error={null}
      fieldErrors={{}} {...props} />,
  );
  return { onSubmit, onClose, ...utils };
}

const nameInput = () => screen.getByLabelText(/Shift Name/i) as HTMLInputElement;
const cutoffInput = () => screen.getByLabelText(/EOD cutoff/i) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /^(Save|Saving…)$/ }) as HTMLButtonElement;
const typeName = (v: string) => fireEvent.change(nameInput(), { target: { value: v } });
const alertTexts = () => screen.queryAllByRole('alert').map(a => a.textContent);

describe('Add Shift', () => {
  it('shows nothing wrong on first render, and an enabled Save button', () => {
    setup();
    expect(alertTexts()).toEqual([]);
    expect(nameInput().getAttribute('aria-invalid')).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it('marks the required fields with an asterisk', () => {
    setup();
    expect(screen.getByText('Shift Name *')).toBeTruthy();
    expect(screen.getByText('Start Time *')).toBeTruthy();
    expect(screen.getByText('End Time *')).toBeTruthy();
  });

  it('empty submit: error under the name, no API call, focus on the name, accessible wiring', () => {
    const { onSubmit } = setup();
    fireEvent.click(saveButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Shift name is required.']);
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    const describedBy = nameInput().getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)!.textContent).toBe('Shift name is required.');
    expect(document.activeElement).toBe(nameInput());
  });

  it('whitespace-only name counts as empty', () => {
    const { onSubmit } = setup();
    typeName('     ');
    fireEvent.click(saveButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Shift name is required.']);
  });

  it('fixing one field clears only that field\'s error, live', () => {
    setup();
    cutoffInput().value = '';
    fireEvent.change(cutoffInput(), { target: { value: '30' } });
    fireEvent.click(saveButton());
    expect(alertTexts()).toEqual(['Shift name is required.', 'EOD cutoff must be between 0 and 24 hours.']);

    typeName('General');                         // fix the name only
    expect(alertTexts()).toEqual(['EOD cutoff must be between 0 and 24 hours.']);
    fireEvent.change(cutoffInput(), { target: { value: '3' } });
    expect(alertTexts()).toEqual([]);
  });

  it('name over the maximum length is rejected with the limit named', () => {
    const { onSubmit } = setup();
    typeName('a'.repeat(MAX_SHIFT_NAME + 1));
    fireEvent.click(saveButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual([`Shift name must be ${MAX_SHIFT_NAME} characters or fewer.`]);
  });

  it('valid submit sends the trimmed name and the times', () => {
    const { onSubmit } = setup();
    typeName('  General  ');
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'General', startTime: '09:00:00', endTime: '18:00:00', eodCutoffHours: null });
    expect(alertTexts()).toEqual([]);
  });

  it('submits a typed cutoff as a number', () => {
    const { onSubmit } = setup();
    typeName('Night');
    fireEvent.change(cutoffInput(), { target: { value: '3' } });
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Night', eodCutoffHours: 3 }));
  });

  it('Enter in the name field submits (and shows the error when it is empty)', () => {
    const { onSubmit } = setup();
    fireEvent.submit(nameInput().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Shift name is required.']);
  });

  it('server duplicate: shown inline under the name in the backend\'s words, no banner, cleared by editing the name', () => {
    const msg = 'A shift with this name already exists';
    const view = setup({ fieldErrors: { name: msg } });
    expect(alertTexts()).toEqual([msg]);
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(nameInput());

    typeName('General 2');
    expect(alertTexts()).toEqual([]);
    expect(nameInput().getAttribute('aria-invalid')).toBeNull();
    view.unmount();
  });

  it('a failure that cannot be pinned to a field shows as one banner', () => {
    setup({ error: 'Failed to save shift.' });
    expect(alertTexts()).toEqual(['Failed to save shift.']);
  });

  it('pending: the button is disabled, says Saving…, and a second submit is ignored', () => {
    const { onSubmit } = setup({ isPending: true });
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent).toBe('Saving…');
    typeName('General');
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

describe('Edit Shift (same form)', () => {
  it('opens pre-filled', () => {
    setup({ state: { mode: 'edit', shift: shift({ eodCutoffHours: 3 }) } });
    expect(screen.getByText('Edit Shift')).toBeTruthy();
    expect(nameInput().value).toBe('General');
    expect(cutoffInput().value).toBe('3');
  });

  it('clearing the name and saving shows the same error and does not submit', () => {
    const { onSubmit } = setup({ state: { mode: 'edit', shift: shift() } });
    typeName('');
    fireEvent.click(saveButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['Shift name is required.']);
  });

  it('start equal to end is rejected under End Time', () => {
    const { onSubmit } = setup({ state: { mode: 'edit', shift: shift({ startTime: '09:00:00', endTime: '09:00:00' }) } });
    fireEvent.click(saveButton());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(['End time must be different from start time.']);
    const endHour = screen.getByLabelText('End time hour');
    expect(endHour.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(endHour);
  });

  it('an overnight shift (3:30 PM to 12:30 AM) is valid', () => {
    const { onSubmit } = setup({ state: { mode: 'edit', shift: shift({ startTime: '15:30:00', endTime: '00:30:00', eodCutoffHours: 3 }) } });
    fireEvent.click(saveButton());
    expect(alertTexts()).toEqual([]);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'General', startTime: '15:30:00', endTime: '00:30:00', eodCutoffHours: 3 });
  });

  it('server "same time" error shows under End Time and clears when the end time changes', () => {
    setup({ state: { mode: 'edit', shift: shift() }, fieldErrors: { endTime: 'Start and end time cannot be the same' } });
    expect(alertTexts()).toEqual(['Start and end time cannot be the same']);
    fireEvent.click(screen.getByLabelText('Increase End time minute'));
    expect(alertTexts()).toEqual([]);
  });

  it('reopening for a different shift starts clean (no stale errors)', () => {
    const view = setup({ state: { mode: 'edit', shift: shift() } });
    typeName('');
    fireEvent.click(saveButton());
    expect(alertTexts()).toEqual(['Shift name is required.']);

    view.rerender(
      <ShiftFormModal state={{ mode: 'edit', shift: shift({ id: 8, name: 'Night' }) }} onClose={vi.fn()} onSubmit={vi.fn()}
        isPending={false} error={null} fieldErrors={{}} />,
    );
    expect(nameInput().value).toBe('Night');
    expect(alertTexts()).toEqual([]);
  });
});
