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

import { cancel, scheduleForNotice } from './notifications/index.ts';
import { markCancelled, pendingOsIds, recordScheduled } from './db/reminders.ts';
import { datesOf, listActiveNotices } from './db/notices.ts';

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
export async function rescheduleAllNotices(hour: number): Promise<number> {
  const notices = await listActiveNotices();
  let rescheduled = 0;

  for (const notice of notices) {
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
    rescheduled += 1;
  }

  return rescheduled;
}
