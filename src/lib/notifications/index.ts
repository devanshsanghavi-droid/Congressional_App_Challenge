/**
 * Scheduling the reminder ladder.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * **Locally scheduled only.** There is no push token, no server, no remote
 * notification path. Every reminder is a local one computed on this device from
 * a date the user confirmed, which is what makes the whole app work in airplane
 * mode forever.
 *
 * The ladder itself — which tiers, when they fire, which are urgent — is
 * `src/lib/urgency.ts` and is pure. This file is the part that talks to iOS.
 * Keeping them apart is why the DST behaviour is unit-tested without a
 * simulator.
 *
 * Bodies are localised **at schedule time**, so changing language in Settings
 * has to reschedule (SPEC §6). `rescheduleAll()` is that hook.
 */

import * as Notifications from 'expo-notifications';

import i18n from '../i18n/index.ts';
import type { NoticeDates, ScheduledReminder } from '../urgency.ts';
import { daysUntil, remindersFor } from '../urgency.ts';

/**
 * Show the banner even with the app open. A deadline reminder the user misses
 * because they happened to be looking at the app is the one thing this product
 * cannot afford.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface PermissionOptions {
  /**
   * Ask for iOS *provisional* authorisation, which is granted without a prompt
   * and delivers quietly to Notification Center.
   *
   * Used only by the dev self-test screen. The Simulator has no way to dismiss
   * the normal permission alert from the command line — `simctl privacy` has no
   * `notifications` service and there is no tap injection — so provisional is
   * what makes the scheduling path verifiable without a human.
   *
   * **Not for production.** A deadline this app exists to protect deserves a
   * banner the user actually sees, which means the real prompt.
   */
  readonly provisional?: boolean;
}

export async function requestPermission(options: PermissionOptions = {}): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Do not ask again if the user has explicitly declined; iOS ignores the
  // second prompt anyway and the app must stay fully usable without it.
  if (!existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync(
    options.provisional === true ? { ios: { allowProvisional: true } } : undefined,
  );
  // `granted` is false for provisional authorisation — iOS reports status 3
  // (provisional) rather than 2 (authorized), and expo maps only the latter to
  // granted. Provisional still schedules and still delivers, quietly, so the
  // self-test treats it as usable. Production asks for the real thing and takes
  // `granted` at face value.
  if (requested.granted) return true;
  if (options.provisional !== true) return false;
  return requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export interface ScheduledResult {
  readonly tier: string;
  readonly fireAt: number;
  readonly urgent: boolean;
  readonly osNotificationId: string;
}

function bodyFor(reminder: ScheduledReminder, deadlineMs: number, programName?: string): {
  title: string;
  body: string;
} {
  const days = daysUntil(deadlineMs, reminder.fireAt);
  const program = programName ?? i18n.t('notifications.yourBenefits');

  if (reminder.urgent) {
    return {
      title: i18n.t('notifications.urgentTitle'),
      body: i18n.t('notifications.urgentBody', { program, count: days }),
    };
  }
  if (days === 0) {
    return {
      title: i18n.t('notifications.dueTodayTitle', { program }),
      body: i18n.t('notifications.dueTodayBody'),
    };
  }
  return {
    title: i18n.t('notifications.dueTitle', { program, count: days }),
    body: i18n.t('notifications.dueBody'),
  };
}

/**
 * Schedule the ladder for one notice.
 *
 * Returns what was actually scheduled, including the OS ids, so the caller can
 * store them — without those there is no way to cancel a ladder when the user
 * marks the notice submitted.
 */
export async function scheduleForNotice(options: {
  noticeId: string;
  dates: NoticeDates;
  programName?: string;
  nowMs?: number;
  /** Local hour to fire at. Defaults to the ladder's own default (9am). */
  hour?: number;
}): Promise<ScheduledResult[]> {
  const now = options.nowMs ?? Date.now();
  const reminders = remindersFor(options.dates, now, options.hour);
  const target = options.dates.deadlineDate ?? options.dates.aidPaidPendingDeadline;
  if (target === undefined) return [];

  const scheduled: ScheduledResult[] = [];
  for (const reminder of reminders) {
    const { title, body } = bodyFor(reminder, target, options.programName);
    const osNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        // Lets a tapped notification open the right notice.
        data: { noticeId: options.noticeId, tier: reminder.tier },
        ...(reminder.urgent ? { interruptionLevel: 'timeSensitive' as const } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminder.fireAt),
      },
    });
    scheduled.push({
      tier: reminder.tier,
      fireAt: reminder.fireAt,
      urgent: reminder.urgent,
      osNotificationId,
    });
  }
  return scheduled;
}

export async function cancel(osNotificationIds: readonly string[]): Promise<void> {
  for (const id of osNotificationIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** What iOS currently holds. Used by the dev screen to prove a schedule took. */
export async function listScheduled(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}

