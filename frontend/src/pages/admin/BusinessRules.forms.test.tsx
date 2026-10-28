// @vitest-environment jsdom
/**
 * The Add Shift / Add Holiday modals as the Business Rules page wires them: an empty Save is caught in the form and
 * never reaches the API, and a server rejection (duplicate name / date) comes back through the page's mutations to sit
 * inline under its field instead of a generic message. The tables, kebab menus and audit captions still render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../lib/toast';

const api = vi.hoisted(() => ({
  getBusinessRuleConfig: vi.fn(),
  updateTimeAttendance: vi.fn(),
  updateNotifications: vi.fn(),
  updateAllowances: vi.fn(),
  listShifts: vi.fn(),
  createShift: vi.fn(),
  updateShift: vi.fn(),
  toggleShift: vi.fn(),
  deleteShift: vi.fn(),
  listHolidays: vi.fn(),
  createHoliday: vi.fn(),
  updateHoliday: vi.fn(),
  deleteHoliday: vi.fn(),
}));
vi.mock('../../api/businessRules', () => api);
vi.mock('../../api/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/admin')>()),
  listAuditLog: vi.fn().mockResolvedValue({ content: [], totalPages: 0, totalElements: 0, number: 0, size: 1 }),
}));

import BusinessRules from './BusinessRules';

const http = (status: number, error: string) => ({ response: { status, data: { error } } });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><BusinessRules /></ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getBusinessRuleConfig.mockResolvedValue({
    workingHoursPerDay: 8, weekendRule: 'SAT_SUN', escalationSlaHours: 24,
    lockoutAttemptThreshold: 5, lockoutDurationMinutes: 15, monthlyAdjustmentMinutes: 120,
  });
  api.listShifts.mockResolvedValue([
    { id: 1, name: 'General', startTime: '09:00:00', endTime: '18:00:00', eodCutoffHours: 3, active: true, assignedEmployeeCount: 2 },
  ]);
  api.listHolidays.mockResolvedValue([{ id: 1, name: 'Republic Day', holidayDate: '2026-01-26' }]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

// The page has other Save buttons and fields; the form under test is the open dialog.
const dialog = () => within(screen.getByRole('dialog'));
const alertTexts = () => screen.queryAllByRole('alert').map(a => a.textContent);
// react-query hands the mutation function a second argument (its context); the payload is the first.
const firstArg = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0];

describe('Business Rules page: existing sections still render', () => {
  it('lists the shift and the holiday', async () => {
    renderPage();
    expect(await screen.findByText('General')).toBeTruthy();
    expect(await screen.findByText('Republic Day')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Shift/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Holiday/ })).toBeTruthy();
  });
});

describe('Add Shift on the page', () => {
  it('empty Save shows the error and makes no API call', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Shift/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }));
    expect(alertTexts()).toEqual(['Shift name is required.']);
    expect(api.createShift).not.toHaveBeenCalled();
  });

  it('a duplicate name comes back inline under the name field, in the backend\'s words, and clears on edit', async () => {
    api.createShift.mockRejectedValue(http(409, 'A shift with this name already exists'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Shift/ }));
    const name = dialog().getByLabelText(/Shift Name/i) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'General' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(alertTexts()).toContain('A shift with this name already exists'));
    expect(firstArg(api.createShift)).toEqual({ name: 'General', startTime: '09:00:00', endTime: '18:00:00', eodCutoffHours: null });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('dialog')).toBeTruthy();                 // the modal stays open

    fireEvent.change(name, { target: { value: 'General 2' } });
    expect(alertTexts()).not.toContain('A shift with this name already exists');
  });

  it('while the request is in flight the button reads Saving… and is disabled (no double submit)', async () => {
    api.createShift.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Shift/ }));
    fireEvent.change(dialog().getByLabelText(/Shift Name/i), { target: { value: 'Night' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Save' }));

    const busy = await dialog().findByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(api.createShift).toHaveBeenCalledTimes(1);
  });
});

describe('Add Holiday on the page', () => {
  it('empty Add shows an error under each required field and makes no API call', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Holiday/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'Add' }));
    expect(alertTexts()).toEqual(['Holiday name is required.', 'Date is required.']);
    expect(api.createHoliday).not.toHaveBeenCalled();
  });

  it('a duplicate date comes back inline under the date field', async () => {
    api.createHoliday.mockRejectedValue(http(409, 'A holiday is already defined on this date'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Holiday/ }));
    fireEvent.change(dialog().getByLabelText(/Holiday Name/i), { target: { value: 'Another' } });
    const date = dialog().getByLabelText(/^Date/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: '2026-01-26' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(alertTexts()).toContain('A holiday is already defined on this date'));
    expect(firstArg(api.createHoliday)).toEqual({ name: 'Another', holidayDate: '2026-01-26' });
    expect(date.getAttribute('aria-invalid')).toBe('true');
  });

  it('a failure with no field to pin it to shows as a banner', async () => {
    api.createHoliday.mockRejectedValue(new Error('Network Error'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Add Holiday/ }));
    fireEvent.change(dialog().getByLabelText(/Holiday Name/i), { target: { value: 'Another' } });
    fireEvent.change(dialog().getByLabelText(/^Date/i), { target: { value: '2026-02-02' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(alertTexts()).toContain('Failed to add holiday.'));
  });
});
