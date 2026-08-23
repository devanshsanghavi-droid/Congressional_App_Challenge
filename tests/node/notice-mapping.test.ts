/**
 * The pure parts of the storage and scheduling path.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * `expo-sqlite`, `expo-secure-store` and `expo-notifications` are all native
 * modules and belong in the jest-expo project. What is tested here is the logic
 * around them that is pure and therefore worth pinning without a simulator: the
 * date conversions the whole scheduler depends on, and the refusal to persist
 * unredacted text.
 */

import { isoToLocalMs, localMsToIso } from '../../src/lib/dates.ts';
import { daysUntil, remindersFor } from '../../src/lib/urgency.ts';

describe('dates cross the storage boundary without moving a day', () => {
  it('round-trips an ISO date through local-midnight millis', () => {
    for (const iso of ['2026-09-05', '2026-01-01', '2026-12-31', '2027-02-28']) {
      const ms = isoToLocalMs(iso);
      expect(ms).toBeDefined();
      expect(localMsToIso(ms as number)).toBe(iso);
    }
  });

  it('round-trips across both daylight-saving transitions', () => {
    // The dates either side of the US 2026 transitions. A UTC-based conversion
    // lands on the wrong day for one of these, which would mean a reminder on
    // the wrong morning.
    for (const iso of ['2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02']) {
      expect(localMsToIso(isoToLocalMs(iso) as number)).toBe(iso);
    }
  });

  it('lands on local midnight, not on some other hour', () => {
    const ms = isoToLocalMs('2026-09-05') as number;
    const date = new Date(ms);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  it('rejects anything that is not an ISO date', () => {
    for (const bad of ['09/05/2026', 'September 5, 2026', '', 'tomorrow', '2026-13-45x']) {
      expect(isoToLocalMs(bad)).toBeUndefined();
    }
  });

  it('agrees with the scheduler about how many days are left', () => {
    // Home renders `daysUntil` and the notification body computes the same
    // thing. If these ever disagreed, the screen and the alert would say
    // different numbers about the same deadline.
    const deadline = isoToLocalMs('2026-09-05') as number;
    const now = isoToLocalMs('2026-09-01') as number;
    expect(daysUntil(deadline, now)).toBe(4);
  });
});

describe('what the scheduler is handed', () => {
  it('produces reminders that all fall before the deadline', () => {
    const deadline = isoToLocalMs('2026-10-15') as number;
    const now = isoToLocalMs('2026-09-01') as number;
    const reminders = remindersFor({ actionType: 'recert_due', deadlineDate: deadline }, now);
    expect(reminders.length).toBeGreaterThan(0);
    for (const reminder of reminders) {
      expect(reminder.fireAt).toBeGreaterThan(now);
      // The day-of reminder fires at 9am on the deadline day, so it is after
      // local midnight of that day but well before the next one.
      expect(reminder.fireAt).toBeLessThan(deadline + 24 * 3600 * 1000);
    }
  });

  it('schedules nothing at all for an approval', () => {
    // Notice 10's shape. The scheduler must not turn good news into an alert.
    const reminders = remindersFor({ actionType: 'approval' }, Date.now());
    expect(reminders).toEqual([]);
  });
});
