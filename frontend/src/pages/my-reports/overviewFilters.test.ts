import { describe, expect, it } from 'vitest';
import {
  filterCounts, matchesSearch, showsUtilization, sortMembers, utilTone, visibleMembers,
  type ListMember,
} from './overviewFilters';

let nextId = 1;
const mem = (over: Partial<ListMember>): ListMember => ({
  id: nextId++, fullName: 'Person', employeeCode: 'NF000', email: null, status: 'SUBMITTED',
  utilizationPct: null, hasOpenBlocker: false, ...over,
});

const team: ListMember[] = [
  mem({ fullName: 'Zara Khan',  employeeCode: 'NF010', status: 'SUBMITTED',        utilizationPct: 90 }),
  mem({ fullName: 'Asha Rao',   employeeCode: 'NF002', status: 'MISSING' }),
  mem({ fullName: 'Ben Cole',   employeeCode: 'NF003', status: 'PENDING_APPROVAL', utilizationPct: 55, hasOpenBlocker: true }),
  mem({ fullName: 'Chen Wu',    employeeCode: 'NF004', status: 'ON_LEAVE' }),
  mem({ fullName: 'Aaron Pike', employeeCode: 'NF005', status: 'MISSING', hasOpenBlocker: true }),
  mem({ fullName: 'Mia Ford',   employeeCode: 'NF006', status: 'SUBMITTED',        utilizationPct: 70 }),
];
const names = (l: ListMember[]) => l.map(m => m.fullName);

describe('matchesSearch', () => {
  it('matches name or code, case-insensitively, ignoring surrounding spaces', () => {
    expect(matchesSearch(team[0], 'zara')).toBe(true);
    expect(matchesSearch(team[0], '  KHAN ')).toBe(true);
    expect(matchesSearch(team[0], 'nf010')).toBe(true);
    expect(matchesSearch(team[0], 'nf99')).toBe(false);
  });

  it('matches everyone on a blank query', () => {
    expect(matchesSearch(team[0], '')).toBe(true);
    expect(matchesSearch(team[0], '   ')).toBe(true);
  });
});

describe('filterCounts', () => {
  it('counts each status and the blocker chip over the full list', () => {
    expect(filterCounts(team)).toEqual({
      ALL: 6, MISSING: 2, PENDING_APPROVAL: 1, SUBMITTED: 2, ON_LEAVE: 1, HAS_BLOCKER: 2,
    });
  });
});

describe('sortMembers', () => {
  it('"attention" orders Missing → Pending → Submitted → On leave, then by name', () => {
    expect(names(sortMembers(team, 'attention'))).toEqual([
      'Aaron Pike', 'Asha Rao', 'Ben Cole', 'Mia Ford', 'Zara Khan', 'Chen Wu',
    ]);
  });

  it('"name" is alphabetical', () => {
    expect(names(sortMembers(team, 'name'))).toEqual([
      'Aaron Pike', 'Asha Rao', 'Ben Cole', 'Chen Wu', 'Mia Ford', 'Zara Khan',
    ]);
  });

  it('"utilization" is highest first with no-value members last, by name', () => {
    expect(names(sortMembers(team, 'utilization'))).toEqual([
      'Zara Khan', 'Mia Ford', 'Ben Cole', 'Aaron Pike', 'Asha Rao', 'Chen Wu',
    ]);
  });

  it('does not mutate its input', () => {
    const before = names(team);
    sortMembers(team, 'name');
    expect(names(team)).toEqual(before);
  });
});

describe('visibleMembers', () => {
  it('combines the status chip with the search', () => {
    expect(names(visibleMembers(team, 'MISSING', 'asha', 'attention'))).toEqual(['Asha Rao']);
    expect(names(visibleMembers(team, 'MISSING', 'nf00', 'attention'))).toEqual(['Aaron Pike', 'Asha Rao']);
  });

  it('"Has blocker" cuts across statuses', () => {
    expect(names(visibleMembers(team, 'HAS_BLOCKER', '', 'attention'))).toEqual(['Aaron Pike', 'Ben Cole']);
  });

  it('returns nothing when no one matches', () => {
    expect(visibleMembers(team, 'ON_LEAVE', 'zara', 'attention')).toEqual([]);
  });
});

describe('utilTone / showsUtilization', () => {
  it('uses green ≥85, amber 60–84, red <60', () => {
    expect(utilTone(85)).toBe('ok');
    expect(utilTone(84.9)).toBe('warn');
    expect(utilTone(60)).toBe('warn');
    expect(utilTone(59.9)).toBe('risk');
    expect(utilTone(0)).toBe('risk');
  });

  it('hides utilization for Missing and On leave only', () => {
    expect(showsUtilization('MISSING')).toBe(false);
    expect(showsUtilization('ON_LEAVE')).toBe(false);
    expect(showsUtilization('SUBMITTED')).toBe(true);
    expect(showsUtilization('PENDING_APPROVAL')).toBe(true);
  });
});
