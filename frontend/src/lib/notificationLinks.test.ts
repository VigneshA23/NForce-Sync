import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CLARIFICATION_NOTIFICATION_TYPES, ESCALATION_PM_NOTIFIED, PM_OPENABLE_RELATED_TYPES, RELATED_ROUTE_BUILDERS,
  canOpenNotificationLink, isClarificationNotification, markReadOnOpen, resolveRelatedPageHref,
  type RelatedNotification,
} from './notificationLinks';

const escalation = (over: Partial<RelatedNotification> = {}): RelatedNotification => ({
  id: 7, type: ESCALATION_PM_NOTIFIED, link: '/projects/approvals', read: false,
  employeeId: 30, pieceId: 55, eodDate: '2026-10-13', ...over,
});

describe('escalation notification type', () => {
  it('map key and PM-allowed list use the one type string the backend really sends', () => {
    const backend = readFileSync(
      resolve(process.cwd(), '../backend/src/main/java/com/nforceone/sync/approval2/EscalationScheduler.java'), 'utf8');
    // sendWithRelated(pm.getId(), "<type>", ...) — the PM-facing call.
    const sent = /sendWithRelated\(\s*pm\.getId\(\),\s*"([A-Z_]+)"/.exec(backend)?.[1];
    expect(sent).toBeDefined();
    expect(ESCALATION_PM_NOTIFIED).toBe(sent);
    expect(Object.keys(RELATED_ROUTE_BUILDERS)).toContain(sent);
    expect(PM_OPENABLE_RELATED_TYPES).toContain(sent);
  });

  it('every client-built route type is PM-openable, and vice versa (they cannot drift apart)', () => {
    expect([...PM_OPENABLE_RELATED_TYPES].sort()).toEqual(Object.keys(RELATED_ROUTE_BUILDERS).sort());
  });
});

describe('resolveRelatedPageHref — escalation', () => {
  it('PM with ids gets the approvals deep link keyed on the piece', () => {
    expect(resolveRelatedPageHref('pm', escalation()))
      .toBe('/projects/approvals?employeeId=30&highlight=55&date=2026-10-13');
  });

  it('date is optional', () => {
    expect(resolveRelatedPageHref('pm', escalation({ eodDate: null })))
      .toBe('/projects/approvals?employeeId=30&highlight=55');
  });

  it('missing ids → no button (old rows), and the message/link are never used to guess', () => {
    expect(resolveRelatedPageHref('pm', escalation({ employeeId: null }))).toBeNull();
    expect(resolveRelatedPageHref('pm', escalation({ pieceId: undefined }))).toBeNull();
    expect(resolveRelatedPageHref('pm', escalation({ employeeId: null, pieceId: null, link: '/projects/approvals' }))).toBeNull();
  });

  it('non-PM roles get no button, even with ids present', () => {
    for (const role of ['employee', 'admin', 'superadmin', undefined]) {
      expect(canOpenNotificationLink(role, ESCALATION_PM_NOTIFIED)).toBe(false);
      expect(resolveRelatedPageHref(role, escalation())).toBeNull();
    }
  });

  it('other types keep using their server-provided link', () => {
    expect(resolveRelatedPageHref('employee', { id: 1, type: 'EOD_APPROVED', link: '/eod/history', read: true }))
      .toBe('/eod/history');
    expect(resolveRelatedPageHref('pm', { id: 1, type: 'EOD_APPROVED', link: '/eod/history', read: true })).toBeNull();
  });
});

describe('markReadOnOpen', () => {
  it('marks an unread notification read', () => {
    const markRead = vi.fn();
    markReadOnOpen({ id: 7, read: false }, markRead);
    expect(markRead).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('does not call markRead again for an already-read notification', () => {
    const markRead = vi.fn();
    markReadOnOpen({ id: 7, read: true }, markRead);
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe('canOpenNotificationLink', () => {
  it('a PM gets a link only for the three clarification types', () => {
    for (const type of CLARIFICATION_NOTIFICATION_TYPES) {
      expect(canOpenNotificationLink('pm', type)).toBe(true);
    }
  });

  it('every other PM notification stays informational (no link)', () => {
    for (const type of ['EOD_APPROVED', 'EOD_REJECTED', 'EOD_SUBMITTED', 'BLOCKER_REPLY', 'SYSTEM_ANNOUNCEMENT']) {
      expect(canOpenNotificationLink('pm', type)).toBe(false);
    }
  });

  it('other roles always keep the link, whatever the type', () => {
    for (const role of ['employee', 'admin', 'superadmin', undefined]) {
      expect(canOpenNotificationLink(role, 'EOD_APPROVED')).toBe(true);
      expect(canOpenNotificationLink(role, 'EOD_CLARIFICATION_REPLY')).toBe(true);
    }
  });

  it('only exact clarification type names are exempt', () => {
    expect(isClarificationNotification('EOD_CLARIFICATION_REQUESTED')).toBe(true);
    expect(isClarificationNotification('EOD_CLARIFICATION')).toBe(false);
    expect(isClarificationNotification('BLOCKER_REPLY')).toBe(false);
  });
});
