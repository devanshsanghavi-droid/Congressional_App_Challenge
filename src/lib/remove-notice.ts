/**
 * Remove one letter from this phone, completely.
 *
 * AUTHORSHIP: Claude. App-side orchestration, beside `wipe.ts` for the same
 * reason: it has to make three stores agree (iOS's notification queue, the
 * encrypted photo on disk, and SQLite), and one edit must not be able to drop
 * one of them.
 *
 * Behind "Remove this letter" on Notice Detail: a letter scanned by mistake, or
 * one that no longer matters, without "Delete everything".
 */

import { cancel } from './notifications/index.ts';
import { pendingOsIds } from './db/reminders.ts';
import { listForSource } from './db/expected.ts';
import { deleteStoredCapture } from './db/images.ts';
import { deleteNotice } from './db/notices.ts';

export async function removeNotice(id: string): Promise<void> {
  const reminders = await pendingOsIds(id);
  const forecasts = (await listForSource(id))
    .map((e) => e.osNotificationId)
    .filter((v): v is string => v !== undefined);
  // iOS first: a notification about a letter that no longer exists would open
  // onto nothing, which is worse than no notification.
  await cancel([...reminders, ...forecasts]);
  deleteStoredCapture(id);
  await deleteNotice(id);
}
