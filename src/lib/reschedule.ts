/**
 * Rebuild every notice's reminder ladder — orchestration, not data access.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN MODULE
 * ---------------------------------------------------------------------------
 * This first lived in `db/reminders.ts`, which seemed natural — it is about
 * reminders. It was a layering mistake and the test suite caught it within
 * minutes: `db/reminders.ts` is **data access**, and importing `db/notices.ts`
 * from it pulled `db/crypto.ts` and then `@noble/ciphers` into every test that
 * had only ever needed a mocked SQLite. `db-first-launch.test.ts` stopped being
 * able to parse, on a change that had nothing to do with first launch.
 *
 * The rule this file follows is the one `wipe.ts` already follows: **a function
 * that coordinates several stores belongs beside them, not inside one of them.**
 * `db/*` talks to the database. `notifications/*` talks to iOS. Anything that
 * has to make those two agree lives out here, where importing both is the
 * declared purpose rather than an accident of where it was typed.
 */

import { cancel, hasPermission, scheduleForNotice } from './notifications/index.ts';
import { markCancelled, pendingOsIds, recordScheduled } from './db/reminders.ts';
import { datesOf, listActiveNotices } from './db/notices.ts';
import type { Notice } from './db/notices.ts';
import { SETTINGS, getStringSetting } from './db/settings.ts';
import { countdownDate, DEFAULT_REMINDER_HOUR, isReminderHour } from './urgency.ts';

/**
 * Rebuild every notice's reminder ladder at a new hour.
 *
 * Called when the user changes reminder timing in Settings. Writing the setting
 * alone would be a lie: reminders already registered with iOS carry the fire
 * time they were created with, so the screen would say "evening" while the phone
 * kept buzzing at 9am.
 *
 * That is the same failure shape as the 2026-08-25 reminder bug — the database
 * and the OS holding different truths, with only the database consulted — so it
 * is fixed the same way: **ask the OS to forget, tell it again, then record what
 * it accepted.**
 *
 * Per notice rather than `cancelAll()`, because `cancelAll()` would also drop
 * anything scheduled outside this loop, and a wipe of the OS queue is not what
 * "I prefer evenings" asked for.
 *
 * Returns how many notices were rescheduled. A notice whose deadline has already
 * passed produces an empty ladder and is counted as done, not as a failure.
 */
async function rescheduleOne(notice: Notice, hour: number): Promise<void> {
  const existing = await pendingOsIds(notice.id);
  if (existing.length > 0) await cancel(existing);
  await markCancelled(notice.id);

  const scheduled = await scheduleForNotice({
    noticeId: notice.id,
    dates: datesOf(notice),
    hour,
    ...(notice.programId === undefined ? {} : { programName: notice.programId }),
  });
  if (scheduled.length > 0) await recordScheduled(notice.id, scheduled);
}

export async function rescheduleAllNotices(hour: number): Promise<number> {
  const notices = await listActiveNotices();
  for (const notice of notices) await rescheduleOne(notice, hour);
  return notices.length;
}

/** The reminder hour the user chose, or the default. Never throws. */
async function reminderHour(): Promise<number> {
  try {
    const stored = await getStringSetting(SETTINGS.reminderHour);
    const parsed = stored === undefined ? Number.NaN : Number.parseInt(stored, 10);
    return isReminderHour(parsed) ? parsed : DEFAULT_REMINDER_HOUR;
  } catch {
    return DEFAULT_REMINDER_HOUR;
  }
}

/**
 * Re-schedule reminders that were dropped because permission was refused.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * Found on a physical phone, 2026-08-26. Three correct behaviours compose into
 * a trap with no exit:
 *
 *   1. A notice saved before notification permission is granted schedules its
 *      ladder, and iOS keeps none of it.
 *   2. `reconcileWithOs` notices that and marks every reminder `cancelled` —
 *      correctly; that is the fix from 2026-08-25 doing its job.
 *   3. Home reads `remindersActive` as `COUNT(*) WHERE state = 'scheduled'`, so
 *      it shows "reminders are not set" — accurately.
 *
 * Then the user grants permission, and **nothing re-evaluates.** The count never
 * recovers, the warning never clears, and the only way out was to delete the
 * notice and photograph it again. Someone who taps "not now" and changes their
 * mind an hour later should not lose every notice they already saved.
 *
 * Deliberately conservative:
 *
 * - **Never prompts.** Uses `hasPermission()`, which only reads. A permission
 *   dialog appearing on app foreground, outside anything the user initiated,
 *   would be its own bug.
 * - **No-ops when there is nothing to fix.** Only notices with a real countdown
 *   date and no live reminders are touched, so the common path — foregrounding
 *   the app with everything healthy — cancels and re-creates nothing.
 * - **Returns the count** so a caller can tell whether anything happened.
 */
export async function resyncDroppedReminders(): Promise<number> {
  if (!(await hasPermission())) return 0;

  const notices = await listActiveNotices();
  const stranded = notices.filter(
    (notice) => !notice.remindersActive && countdownDate(datesOf(notice)) !== undefined,
  );
  if (stranded.length === 0) return 0;

  const hour = await reminderHour();
  for (const notice of stranded) await rescheduleOne(notice, hour);
  return stranded.length;
}
