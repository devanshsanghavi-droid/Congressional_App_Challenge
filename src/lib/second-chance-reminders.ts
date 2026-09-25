/**
 * A reminder before a second-chance date, when someone asks for one.
 *
 * AUTHORSHIP: Claude. App-side orchestration (notifications + two tables).
 *
 * Never automatic. A second-chance date is worked out, not printed, so it is
 * only scheduled after the person has read it, with its "confirm with your
 * county" line, and tapped to be reminded: the same rule as every other date in
 * Carta (CLAUDE.md §3 rule 6), applied to a date the app derived.
 */

import { cancel, requestPermission, scheduleOnce } from './notifications/index.ts';
import { listForNotice, markTierCancelled, recordScheduled } from './db/reminders.ts';
import { followupTier, removeFollowup, saveFollowup } from './db/followups.ts';
import { reminderTime } from './reminder-time.ts';
import { followupFireTime } from './timelines.ts';
import type { SecondChance } from './timelines.ts';
import { followupContent } from './followup-content.ts';

export type RemindResult = 'scheduled' | 'too_late' | 'no_permission';

/** Schedule one reminder before `chance`. Asks for notification permission, since the person just tapped for this. */
export async function remindBefore(noticeId: string, chance: SecondChance, nowMs = Date.now()): Promise<RemindResult> {
  const { hour, minute } = await reminderTime();
  const fireAt = followupFireTime(chance.dateMs, nowMs, hour, minute);
  if (fireAt === undefined) return 'too_late';
  if (!(await requestPermission())) return 'no_permission';

  await cancelBefore(noticeId, chance.rule.id);
  const osNotificationId = await scheduleOnce({
    ...followupContent(chance.rule, chance.dateMs),
    fireAt,
    data: { noticeId, tier: followupTier(chance.rule.id) },
  });
  await recordScheduled(noticeId, [{ tier: followupTier(chance.rule.id), fireAt, urgent: false, osNotificationId }]);
  await saveFollowup(noticeId, chance.rule.id, chance.dateMs);
  return 'scheduled';
}

/** Undo `remindBefore`. */
export async function cancelBefore(noticeId: string, ruleId: string): Promise<void> {
  const tier = followupTier(ruleId);
  const pending = (await listForNotice(noticeId)).filter((r) => r.tier === tier && r.state === 'scheduled');
  await cancel(pending.map((r) => r.osNotificationId).filter((v): v is string => v !== undefined));
  await markTierCancelled(noticeId, tier);
  await removeFollowup(noticeId, ruleId);
}

/** Which rules this notice already has a reminder for, so the screen can say so. */
export async function remindedRuleIds(noticeId: string): Promise<Set<string>> {
  const reminders = await listForNotice(noticeId);
  return new Set(
    reminders
      .filter((r) => r.state === 'scheduled' && r.tier.startsWith('followup:'))
      .map((r) => r.tier.slice('followup:'.length)),
  );
}
