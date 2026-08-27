/**
 * What a reminder should actually say.
 *
 * AUTHORSHIP: Claude. App-side orchestration.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Found by using the app on a phone, 2026-08-26. The reminder said:
 *
 *     CalFresh: 3 days left
 *     Open Carta to see what to send.
 *
 * Which is a notification about a notification. Everything a person needs at
 * that moment — which form, what to put in the envelope — was already in the
 * app, one screen away, and the reminder pointed at it instead of carrying it.
 *
 * A reminder arrives on a lock screen, often while the user is at work with
 * both hands busy. If it does not say what to do, it costs them an unlock, a
 * launch and two taps before it has told them anything, and the whole premise
 * of this product is the reminder that gets acted on rather than dismissed.
 *
 * **This module is deliberately pure**: i18n and types only, no database. It is
 * imported by `notifications/`, which the bare-Node test project loads, and
 * reaching into `db/` from here dragged `expo-sqlite` (and then `expo-asset`)
 * into suites that only ever needed a mocked store. That is the third time this
 * exact layering mistake has broken tests unrelated to the change; the fetching
 * half lives in `reminder-documents.ts`.
 *
 * **It reports, it never prescribes.** Every document named came off the user's
 * own letter (`origin: 'letter'`); nothing here asserts what a programme
 * requires, which CLAUDE.md §16 forbids.
 */

import i18n from './i18n/index.ts';
import type { ActionType } from './urgency.ts';

/** How many documents to name before the sentence stops being readable. */
const MAX_NAMED = 3;

/**
 * The action sentence: what to do, in one clause, first on the lock screen.
 *
 * Keyed on action type, using wording already reviewed for Notice Detail rather
 * than new claims written for a notification.
 */
export function actionLine(actionType: ActionType | undefined): string {
  switch (actionType) {
    case 'recert_due':
      return i18n.t('notifications.doRecert');
    case 'info_request':
      return i18n.t('notifications.doInfoRequest');
    case 'discontinuance':
    case 'reduction':
    case 'denial':
      return i18n.t('notifications.doAppeal');
    default:
      return i18n.t('notifications.doGeneric');
  }
}

/**
 * The body of a deadline reminder: the action, then what to put with it.
 *
 * Order matters and is the reason this is a function rather than one string.
 * iOS collapses a notification to roughly two lines and expands the rest on a
 * long press, so the action goes first and the document list second — the user
 * who only glances still learns what to do.
 */
export function reminderBody(
  actionType: ActionType | undefined,
  documents: readonly string[],
): string {
  const action = actionLine(actionType);
  if (documents.length === 0) return action;

  const named = documents.slice(0, MAX_NAMED);
  const extra = documents.length - named.length;
  const list = i18n.t('notifications.sendList', { items: named.join(', ') });
  const more = extra > 0 ? ` ${i18n.t('notifications.andMore', { count: extra })}` : '';
  return `${action} ${list}${more}`;
}
