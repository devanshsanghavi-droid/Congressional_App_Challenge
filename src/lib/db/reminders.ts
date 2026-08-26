/**
 * Reminder rows — the record of what was handed to iOS.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * The OS owns the schedule; this table owns the *knowledge* of it. Without the
 * stored `os_notification_id` there is no way to cancel a ladder when the user
 * marks a notice submitted, and they would keep being reminded about something
 * they have already done — which is the exact experience this app exists to
 * prevent.
 */

import { getDatabase } from './index.ts';
import type { ReminderRow, ReminderState } from './schema.ts';

export interface StoredReminder {
  readonly id: string;
  readonly noticeId: string;
  readonly fireAt: number;
  readonly tier: string;
  readonly urgent: boolean;
  readonly osNotificationId?: string;
  readonly state: ReminderState;
}

export async function recordScheduled(
  noticeId: string,
  scheduled: readonly { tier: string; fireAt: number; urgent: boolean; osNotificationId: string }[],
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const reminder of scheduled) {
      await db.runAsync(
        `INSERT INTO reminders (id, notice_id, fire_at, tier, urgent, os_notification_id, state)
         VALUES (?,?,?,?,?,?,?)`,
        `r_${noticeId}_${reminder.tier}_${reminder.fireAt}`,
        noticeId,
        reminder.fireAt,
        reminder.tier,
        reminder.urgent ? 1 : 0,
        reminder.osNotificationId,
        'scheduled' satisfies ReminderState,
      );
    }
  });
}

/**
 * Mark as cancelled every reminder iOS did not actually keep.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `recordScheduled` writes `state = 'scheduled'` because that is what the app
 * asked for. **iOS does not always agree.** Without notification authorisation
 * it accepts every `scheduleNotificationAsync` call, returns an id for each,
 * and retains none of them — and there is a pending-notification cap besides.
 *
 * Home computes `remindersActive` from `COUNT(*) WHERE state = 'scheduled'`,
 * so an unreconciled table means Home shows a notice as covered while nothing
 * will ever fire. Found on a cold-start pass 2026-08-25: on a freshly erased
 * device the database held four rows marked `scheduled`, each with an OS id,
 * and the OS held **zero**.
 *
 * The app already asked the right question — `listScheduled()` was being read
 * and written into the diagnostic trace. It just never wrote the answer back.
 * This is that write.
 *
 * Returns how many reminders were dropped, so the caller can tell the user.
 */
export async function reconcileWithOs(
  noticeId: string,
  osNotificationIds: readonly string[],
): Promise<number> {
  const db = await getDatabase();
  const held = new Set(osNotificationIds);
  const rows = await db.getAllAsync<{ id: string; os_notification_id: string | null }>(
    `SELECT id, os_notification_id FROM reminders
      WHERE notice_id = ? AND state = 'scheduled'`,
    noticeId,
  );

  const dropped = rows.filter((r) => r.os_notification_id === null || !held.has(r.os_notification_id));
  if (dropped.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const row of dropped) {
      // `cancelled`, not a new state: from the user's point of view a reminder
      // the OS never accepted and one that was cancelled are the same thing —
      // it is not going to arrive — and Home's existing warning already covers
      // it. Inventing a third state would mean teaching every reader about a
      // distinction that changes nothing.
      await db.runAsync(
        `UPDATE reminders SET state = 'cancelled' WHERE id = ?`,
        row.id,
      );
    }
  });
  return dropped.length;
}

export async function listForNotice(noticeId: string): Promise<StoredReminder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ReminderRow>(
    'SELECT * FROM reminders WHERE notice_id = ? ORDER BY fire_at ASC',
    noticeId,
  );
  return rows.map((row) => ({
    id: row.id,
    noticeId: row.notice_id,
    fireAt: row.fire_at,
    tier: row.tier,
    urgent: row.urgent === 1,
    ...(row.os_notification_id === null ? {} : { osNotificationId: row.os_notification_id }),
    state: row.state as ReminderState,
  }));
}

/** The OS ids still outstanding for a notice, so they can be cancelled. */
export async function pendingOsIds(noticeId: string): Promise<string[]> {
  const reminders = await listForNotice(noticeId);
  return reminders
    .filter((r) => r.state === 'scheduled' && r.osNotificationId !== undefined)
    .map((r) => r.osNotificationId as string);
}

export async function markCancelled(noticeId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE reminders SET state = 'cancelled' WHERE notice_id = ? AND state = 'scheduled'",
    noticeId,
  );
}
