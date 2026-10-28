import { describe, expect, it } from 'vitest';
import { inactiveNames, pickerItems, withInactiveSuffix } from './masterOptions';

interface Item { id: number; name: string; active: boolean }

// `all` is in the backend's order; the pickers must keep it whatever the master sorts by.
const chennai: Item = { id: 1, name: 'Chennai', active: true };
const hyderabad: Item = { id: 2, name: 'Hyderabad, India', active: false };
const pune: Item = { id: 3, name: 'Pune', active: true };

const all = [chennai, hyderabad, pune];
const active = [chennai, pune];

describe('pickerItems', () => {
  it('Add (no current value): active items only', () => {
    expect(pickerItems(active, all, null)).toEqual(active);
    expect(pickerItems(active, all, undefined)).toEqual(active);
  });

  it('Edit on an active value: active items only', () => {
    expect(pickerItems(active, all, 1)).toEqual(active);
  });

  it('Edit on an inactive value: keeps the current one, in the backend order', () => {
    expect(pickerItems(active, all, 2).map(i => i.name)).toEqual(['Chennai', 'Hyderabad, India', 'Pune']);
  });

  it('keeps the backend order for masters not sorted by name (e.g. shifts by start time)', () => {
    const night: Item = { id: 10, name: 'Night', active: true };
    const day: Item = { id: 11, name: 'Day', active: false };
    const evening: Item = { id: 12, name: 'Evening', active: true };
    // start-time order: Night, Day, Evening
    expect(pickerItems([night, evening], [night, day, evening], 11).map(i => i.name))
      .toEqual(['Night', 'Day', 'Evening']);
  });

  it('does not add a current value that is unknown to the full list', () => {
    expect(pickerItems(active, all, 99)).toEqual(active);
  });

  it('does not mutate its inputs', () => {
    const copy = [...active];
    pickerItems(active, all, 2);
    expect(active).toEqual(copy);
  });
});

describe('withInactiveSuffix', () => {
  it('marks only inactive items', () => {
    expect(withInactiveSuffix('Chennai', true)).toBe('Chennai');
    expect(withInactiveSuffix('Hyderabad, India', false)).toBe('Hyderabad, India (inactive)');
  });
});

describe('inactiveNames', () => {
  it('returns the names of deactivated items only', () => {
    expect(inactiveNames(all, i => i.name)).toEqual(['Hyderabad, India']);
  });
});
