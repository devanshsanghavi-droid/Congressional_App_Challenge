/**
 * Countdown tiers and the reminder ladder.
 *
 * AUTHORSHIP: Claude. Tests for src/lib/urgency.ts.
 *
 * These are the rules that turn a confirmed extraction into something the user
 * actually sees, so they are tested against the boundaries: the exact day a
 * tier changes, the deadline that has already passed, and the daylight-saving
 * transitions where "thirty days before" and "thirty times a day" are not the
 * same date.
 */

import {
  countdownDate,
  countdownTier,
  daysUntil,
  isUrgent,
  remindersFor,
} from '../../src/lib/urgency.ts';
import type { NoticeDates } from '../../src/lib/urgency.ts';

const at = (y: number, m: number, d: number, h = 9): number =>
  new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const recert = (deadline: number): NoticeDates => ({
  actionType: 'recert_due',
  deadlineDate: deadline,
});

describe('daysUntil counts calendar days, not 24-hour blocks', () => {
  it('counts forward and backward', () => {
    expect(daysUntil(at(2026, 9, 5), at(2026, 9, 1))).toBe(4);
    expect(daysUntil(at(2026, 9, 1), at(2026, 9, 5))).toBe(-4);
    expect(daysUntil(at(2026, 9, 5, 23), at(2026, 9, 5, 1))).toBe(0);
  });

  it('is unaffected by the time of day', () => {
    // 11pm to 1am the next morning is two hours and one day.
    expect(daysUntil(at(2026, 9, 6, 1), at(2026, 9, 5, 23))).toBe(1);
  });

  it('survives both daylight-saving transitions', () => {
    // US DST ends Nov 1 2026 (a 25-hour day) and begins Mar 8 2026 (23 hours).
    // Millisecond division gets both of these wrong by a fraction of a day,
    // which rounds into an off-by-one on the countdown.
    expect(daysUntil(at(2026, 11, 2), at(2026, 10, 31))).toBe(2);
    expect(daysUntil(at(2026, 3, 9), at(2026, 3, 7))).toBe(2);
    expect(daysUntil(at(2026, 11, 22), at(2026, 8, 24))).toBe(90);
  });
});

describe('countdown tier boundaries (SPEC §7: green >14, amber 3–14, red <3)', () => {
  const now = at(2026, 9, 1);
  const tierAt = (days: number): string => {
    const deadline = new Date(2026, 8, 1 + days, 0, 0, 0, 0).getTime();
    return countdownTier(recert(deadline), now);
  };

  it('is red inside three days', () => {
    expect(tierAt(0)).toBe('red');
    expect(tierAt(1)).toBe('red');
    expect(tierAt(2)).toBe('red');
  });

  it('turns amber at exactly three days and stays amber through fourteen', () => {
    expect(tierAt(3)).toBe('amber');
    expect(tierAt(14)).toBe('amber');
  });

  it('is green from fifteen days out', () => {
    expect(tierAt(15)).toBe('green');
    expect(tierAt(120)).toBe('green');
  });

  it('reports a passed deadline as expired, not as red', () => {
    // A deadline that has gone is a different fact from one that is imminent,
    // and the user needs to be told which.
    expect(tierAt(-1)).toBe('expired');
  });

  it('has no tier when the notice states no date to count down to', () => {
    expect(countdownTier({ actionType: 'approval' }, now)).toBe('none');
  });
});

describe('which date the countdown counts down to', () => {
  it('prefers the stated action deadline', () => {
    const dates: NoticeDates = {
      actionType: 'discontinuance',
      deadlineDate: at(2026, 9, 30),
      aidPaidPendingDeadline: at(2026, 9, 3),
      appealDeadline: at(2026, 11, 22),
    };
    expect(countdownDate(dates)).toBe(at(2026, 9, 30));
  });

  it('falls back to the aid-paid-pending date when there is no action deadline', () => {
    // Notice 05's shape: a reduction with no return-by date, where the date
    // that matters is the one for keeping benefits during a hearing.
    expect(
      countdownDate({ actionType: 'reduction', aidPaidPendingDeadline: at(2026, 9, 28) }),
    ).toBe(at(2026, 9, 28));
  });

  it('never counts down to an appeal deadline', () => {
    // An appeal window is a right, not an obligation. Counting down to it would
    // manufacture urgency on notices where nothing is required at all.
    expect(countdownDate({ actionType: 'approval', appealDeadline: at(2026, 11, 10) })).toBeUndefined();
  });
});

describe('the reminder ladder', () => {
  it('schedules all six tiers at 9am local when there is time for them', () => {
    const reminders = remindersFor(recert(at(2026, 10, 15)), at(2026, 9, 1));
    expect(reminders.map((r) => r.tier)).toEqual(['t30', 't14', 't7', 't3', 't1', 'day_of']);
    for (const reminder of reminders) {
      expect(new Date(reminder.fireAt).getHours()).toBe(9);
    }
  });

  it('suppresses tiers that have already passed rather than firing them late', () => {
    // Photographed five days before the deadline: T-30, T-14 and T-7 are gone.
    // Firing them on confirmation would be four notifications at once.
    const reminders = remindersFor(recert(at(2026, 9, 30)), at(2026, 9, 25, 12));
    expect(reminders.map((r) => r.tier)).toEqual(['t3', 't1', 'day_of']);
  });

  it('schedules nothing for a deadline that has already gone', () => {
    expect(remindersFor(recert(at(2026, 9, 5)), at(2026, 9, 20))).toEqual([]);
  });

  it('keeps 9am local across a daylight-saving boundary', () => {
    // T-30 from Nov 20 lands on Oct 21, the other side of the Nov 1 change.
    // Subtracting 30 × 86,400,000 ms would put it at 10am.
    const reminders = remindersFor(recert(at(2026, 11, 20)), at(2026, 10, 1));
    const t30 = reminders.find((r) => r.tier === 't30');
    const fired = new Date(t30!.fireAt);
    expect(fired.getHours()).toBe(9);
    expect(fired.getMonth()).toBe(9); // October
    expect(fired.getDate()).toBe(21);
  });

  it('adds a distinct urgent tier for the aid-paid-pending window', () => {
    const reminders = remindersFor(
      {
        actionType: 'discontinuance',
        deadlineDate: at(2026, 9, 30),
        aidPaidPendingDeadline: at(2026, 9, 3),
      },
      at(2026, 8, 25),
    );
    const urgent = reminders.filter((r) => r.urgent);
    expect(urgent).toHaveLength(2);
    expect(urgent.every((r) => r.tier === 'appeal_urgent')).toBe(true);
    // The urgent pair fires before the standard ladder's later tiers, and the
    // list comes back in fire order so the UI can read it straight through.
    expect(reminders.map((r) => r.fireAt)).toEqual([...reminders.map((r) => r.fireAt)].sort((a, b) => a - b));
  });

  it('schedules nothing at all for a notice with no dates', () => {
    expect(remindersFor({ actionType: 'approval' }, at(2026, 9, 1))).toEqual([]);
    expect(isUrgent({ actionType: 'approval' }, at(2026, 9, 1))).toBe(false);
  });
});
