/**
 * The time of day reminders fire at.
 *
 * AUTHORSHIP: Claude. App-side. Split out of `reschedule.ts` so the modules that
 * schedule individual reminders can read it without an import cycle.
 */

import { SETTINGS, getStringSetting } from './db/settings.ts';
import { DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, isReminderTime } from './urgency.ts';

/** The reminder time the user chose, or the default. Never throws. */
export async function reminderTime(): Promise<{ hour: number; minute: number }> {
  const fallback = { hour: DEFAULT_REMINDER_HOUR, minute: DEFAULT_REMINDER_MINUTE };
  try {
    const h = await getStringSetting(SETTINGS.reminderHour);
    const m = await getStringSetting(SETTINGS.reminderMinute);
    const hour = h === undefined ? Number.NaN : Number.parseInt(h, 10);
    const minute = m === undefined ? 0 : Number.parseInt(m, 10);
    return isReminderTime(hour, minute) ? { hour, minute } : fallback;
  } catch {
    return fallback;
  }
}
