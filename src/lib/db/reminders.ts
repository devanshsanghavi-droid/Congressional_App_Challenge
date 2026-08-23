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
