import { describe, expect, it } from 'vitest';
import {
  CLARIFICATION_NOTIFICATION_TYPES, canOpenNotificationLink, isClarificationNotification,
} from './notificationLinks';

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
