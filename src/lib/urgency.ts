/**
 * Countdown tiers and the reminder ladder.
 *
 * AUTHORSHIP: Claude. This is app-side product logic (CLAUDE.md §7 — Claude
 * drives /src/lib), not extraction. It contains no parsing and reads nothing
 * off a page: it takes fields that have already been *confirmed by the user*
 * and answers two questions — what colour is the countdown, and which reminders
 * get scheduled.
 *
 * It is pure and dependency-free so the metrics harness can assert against it
 * in bare Node, which is what makes "the approval notice must not produce a red
 * countdown" a test rather than a claim.
 *
 * Rules are SPEC §6 (reminder ladder) and SPEC §7 (Home).
 */

export type ActionType =
  | 'approval'
  | 'denial'
  | 'reduction'
  | 'discontinuance'
  | 'info_request'
  | 'recert_due';

export type CountdownTier = 'none' | 'green' | 'amber' | 'red' | 'expired';

export type ReminderTier = 't30' | 't14' | 't7' | 't3' | 't1' | 'day_of' | 'appeal_urgent';

/**
 * The confirmed dates a notice carries, as epoch milliseconds in the device's
 * local timezone. Every one is optional because a notice that does not state a
 * date does not get one invented for it (CLAUDE.md §4).
 */
export interface NoticeDates {
  readonly actionType: ActionType;
  /** The date the recipient must act by. */
  readonly deadlineDate?: number;
  /** Ask for a hearing by this date and benefits continue meanwhile. */
  readonly aidPaidPendingDeadline?: number;
  /** The last day a hearing can be requested at all. */
  readonly appealDeadline?: number;
}

export interface ScheduledReminder {
  readonly tier: ReminderTier;
  readonly fireAt: number;
  /** True for the aid-paid-pending tier, which the UI renders differently. */
  readonly urgent: boolean;
}

/**
 * The hour reminders fire at, local time (SPEC §6).
 *
 * 9am by default: early enough to act on the same day, late enough not to wake
 * anyone. It is a **setting**, not a constant, because "before your shift" and
 * "after the kids are in bed" are different hours for different people and
 * Carta's whole promise is a reminder that actually gets seen.
 */
export const DEFAULT_REMINDER_HOUR = 9;

/** Minutes past the hour, by default none. */
export const DEFAULT_REMINDER_MINUTE = 0;

/**
 * Settings offers a real time picker rather than a short list of preset hours.
 *
 * The presets were the original design, on the reasoning that every extra degree
 * of freedom is a decision asked of someone who opened the app because a letter
 * frightened them. Using it on a phone disproved that: "morning" and "evening"
 * are not the shape of a real day, and the whole promise of this product is a
 * reminder that is actually seen. Somebody who starts a shift at 6:45 needs
 * 6:15, and no list of four is going to contain it.
 */
export function isReminderTime(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

/** Days before the deadline that the standard ladder fires on. */
const LADDER: readonly { tier: ReminderTier; daysBefore: number }[] = [
  { tier: 't30', daysBefore: 30 },
  { tier: 't14', daysBefore: 14 },
  { tier: 't7', daysBefore: 7 },
  { tier: 't3', daysBefore: 3 },
  { tier: 't1', daysBefore: 1 },
  { tier: 'day_of', daysBefore: 0 },
];

/** The aid-paid-pending window gets its own two-step, visually distinct tier. */
const URGENT_LADDER: readonly number[] = [2, 1];

/**
 * Which date the Home countdown counts down to.
 *
 * `deadline_date` when the notice states one. Otherwise the aid-paid-pending
 * date, because on a reduction or a discontinuance with no return-by date that
 * *is* the date the household has to act by to keep what they have.
 *
 * `appeal_deadline` is deliberately never a countdown source. It is a right,
 * not an obligation, and it exists on notices — including approvals — where
 * nothing is required of the recipient at all. Counting down to it would
 * manufacture urgency out of good news, which is exactly the failure the
 * approval-notice test guards against.
 */
export function countdownDate(dates: NoticeDates): number | undefined {
  return dates.deadlineDate ?? dates.aidPaidPendingDeadline;
}

/** Local calendar days from `nowMs` to `targetMs`; negative once it has passed. */
export function daysUntil(targetMs: number, nowMs: number): number {
  const startOfDay = (ms: number): number => {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  // Divide a millisecond difference between two local midnights, then round:
  // across a DST boundary one of those "days" is 23 or 25 hours long, and
  // rounding is what keeps the answer a whole number of calendar days.
  return Math.round((startOfDay(targetMs) - startOfDay(nowMs)) / 86_400_000);
}

/**
 * Home's countdown colour: green above 14 days, amber from 3 to 14, red below
 * 3 (SPEC §7). `none` when the notice sets no date to count down to.
 */
export function countdownTier(dates: NoticeDates, nowMs: number): CountdownTier {
  const target = countdownDate(dates);
  if (target === undefined) return 'none';
  const days = daysUntil(target, nowMs);
  if (days < 0) return 'expired';
  if (days < 3) return 'red';
  if (days <= 14) return 'amber';
  return 'green';
}

/** `hour`:`minute` local on the day `daysBefore` days ahead of `targetMs`. */
function fireTime(targetMs: number, daysBefore: number, hour: number, minute: number): number {
  const target = new Date(targetMs);
  // setDate() rather than subtracting milliseconds: across a DST change the
  // arithmetic version lands an hour off, and these fire at a stated wall-clock
  // time, not after a stated duration.
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate() - daysBefore,
    hour,
    minute,
  ).getTime();
}

/**
 * The reminders to schedule once the user confirms a notice.
 *
 * Tiers whose fire time has already passed are suppressed rather than fired
 * immediately (SPEC §6) — a notice photographed a week before its deadline
 * should not produce a burst of four stale notifications.
 */
export function remindersFor(
  dates: NoticeDates,
  nowMs: number,
  hour: number = DEFAULT_REMINDER_HOUR,
  minute: number = DEFAULT_REMINDER_MINUTE,
): ScheduledReminder[] {
  const reminders: ScheduledReminder[] = [];

  if (dates.deadlineDate !== undefined) {
    for (const { tier, daysBefore } of LADDER) {
      const fireAt = fireTime(dates.deadlineDate, daysBefore, hour, minute);
      if (fireAt > nowMs) reminders.push({ tier, fireAt, urgent: false });
    }
  }

  if (dates.aidPaidPendingDeadline !== undefined) {
    for (const daysBefore of URGENT_LADDER) {
      const fireAt = fireTime(dates.aidPaidPendingDeadline, daysBefore, hour, minute);
      if (fireAt > nowMs) reminders.push({ tier: 'appeal_urgent', fireAt, urgent: true });
    }
  }

  return reminders.sort((a, b) => a.fireAt - b.fireAt);
}

/**
 * Does this notice put the household under time pressure at all?
 *
 * The question the approval test asks. An approval with a hearing right and a
 * certification end date six months out is not urgent, and the app must not
 * dress it up as though it were.
 */
export function isUrgent(dates: NoticeDates, nowMs: number): boolean {
  const tier = countdownTier(dates, nowMs);
  return tier === 'red' || remindersFor(dates, nowMs).some((r) => r.urgent);
}
