/**
 * Watching for the letter that should come next, and asking when it has not.
 *
 * AUTHORSHIP: Claude. App-side orchestration (notifications + the expected
 * letters table + notices).
 *
 * A confirmed SAR 7 implies a renewal notice in a known month (see
 * `timelines.ts` and `content/timelines.json` for the rule and its sources). If
 * that month passes and no CalFresh letter has been scanned, the letter may be
 * lost in the mail, sent to an old address, or sitting unopened. Carta cannot see
 * a mailbox, but it can notice the gap and ask, which no agency reminder can:
 * a county cannot warn you about a letter it thinks it already delivered.
 *
 * The forecast is never a deadline. Nothing counts down to it and nothing red
 * appears; it is a quiet row below the countdowns until it is time to ask.
 */

import i18n from './i18n/index.ts';
import { cancel, hasPermission, scheduleOnce, atHour } from './notifications/index.ts';
import { getNotice } from './db/notices.ts';
import type { Notice } from './db/notices.ts';
import {
  getExpected,
  listWaiting,
  saveForecast,
  setAskNotification,
  setAskOn,
  setExpectedState,
} from './db/expected.ts';
import type { ExpectedLetter } from './db/expected.ts';
import { loadTimelines } from './content/index.ts';
import type { ExpectedLetterRule } from './content/types.ts';
import { addDays, arrivalMatches, forecastLetters } from './timelines.ts';
import { reminderTime } from './reminder-time.ts';

export function ruleFor(expected: ExpectedLetter): ExpectedLetterRule | undefined {
  return loadTimelines().expectedLetters.find((r) => r.id === expected.ruleId);
}

export function letterTitle(rule: ExpectedLetterRule): string {
  return i18n.language.startsWith('es') ? rule.titleEs : rule.title;
}

async function scheduleAsk(expected: ExpectedLetter, rule: ExpectedLetterRule, nowMs: number): Promise<void> {
  if (expected.osNotificationId !== undefined) await cancel([expected.osNotificationId]);
  // Never prompts: this runs after a save, not in answer to a tap. The Home
  // card asks the same question whether or not a notification was allowed.
  if (!(await hasPermission())) {
    await setAskNotification(expected.id, undefined);
    return;
  }
  const { hour, minute } = await reminderTime();
  const fireAt = atHour(expected.askOn, hour, minute);
  if (fireAt <= nowMs) {
    await setAskNotification(expected.id, undefined);
    return;
  }
  const month = new Date(expected.expectFrom).toLocaleDateString(i18n.language, { month: 'long' });
  const id = await scheduleOnce({
    title: letterTitle(rule),
    body: i18n.t('notifications.expectedBody', { month }),
    fireAt,
    data: { expectedId: expected.id },
  });
  await setAskNotification(expected.id, id);
}

/**
 * Run after a notice is saved: mark any letter it answers as arrived, then
 * forecast the ones it implies. Never throws into the save path; a forecast is
 * a courtesy and must not be able to lose the notice that was just confirmed.
 */
export async function afterNoticeSaved(noticeId: string, nowMs = Date.now()): Promise<void> {
  try {
    const notice = await getNotice(noticeId);
    if (!notice) return;
    await markArrivals(notice);
    const rules = loadTimelines().expectedLetters;
    const forecasts = forecastLetters(
      {
        actionType: notice.actionType,
        ...(notice.programId === undefined ? {} : { programId: notice.programId }),
        ...(notice.formId === undefined ? {} : { formId: notice.formId }),
        ...(notice.deadlineDate === undefined ? {} : { deadlineDate: notice.deadlineDate }),
        ...(notice.noticeDate === undefined ? {} : { noticeDate: notice.noticeDate }),
        ...(notice.effectiveDate === undefined ? {} : { effectiveDate: notice.effectiveDate }),
      },
      rules,
    );
    for (const forecast of forecasts) {
      const id = await saveForecast({
        sourceNoticeId: noticeId,
        ruleId: forecast.rule.id,
        expectFrom: forecast.expectFromMs,
        expectBy: forecast.expectByMs,
        askOn: forecast.askOnMs,
      });
      const saved = await getExpected(id);
      if (saved) await scheduleAsk(saved, forecast.rule, nowMs);
    }
  } catch (error) {
    console.warn('[carta] expected letters: after-save step failed', error);
  }
}

async function markArrivals(notice: Notice): Promise<void> {
  for (const expected of await listWaiting()) {
    if (expected.sourceNoticeId === notice.id) continue;
    const rule = ruleFor(expected);
    if (!rule) continue;
    if (arrivalMatches({ programs: rule.programs, expectFromMs: expected.expectFrom, askOnMs: expected.askOn }, notice)) {
      if (expected.osNotificationId !== undefined) await cancel([expected.osNotificationId]);
      await setExpectedState(expected.id, 'arrived', notice.id);
    }
  }
}

export type LetterAnswer = 'came' | 'not_yet' | 'never_came' | 'online';

/** Days until Carta asks again after "not yet". */
export const ASK_AGAIN_DAYS = 14;

/** What the person said about a letter Carta was expecting. */
export async function answerExpected(id: string, answer: LetterAnswer, nowMs = Date.now()): Promise<void> {
  const expected = await getExpected(id);
  if (!expected) return;
  if (expected.osNotificationId !== undefined) await cancel([expected.osNotificationId]);
  switch (answer) {
    case 'came':
      await setExpectedState(id, 'arrived');
      return;
    case 'online':
      await setExpectedState(id, 'online');
      return;
    case 'never_came':
      await setExpectedState(id, 'not_arrived');
      return;
    case 'not_yet': {
      const askOn = addDays(nowMs, ASK_AGAIN_DAYS);
      await setAskOn(id, askOn);
      const rule = ruleFor(expected);
      const updated = await getExpected(id);
      if (rule && updated) await scheduleAsk(updated, rule, nowMs);
    }
  }
}

/** Rebuild every pending "did it come?" at a new reminder time. */
export async function rescheduleAsks(nowMs = Date.now()): Promise<void> {
  for (const expected of await listWaiting()) {
    if (expected.state !== 'expected') continue;
    const rule = ruleFor(expected);
    if (rule) await scheduleAsk(expected, rule, nowMs);
  }
}

/** Is it time to ask about this one? */
export function isDue(expected: ExpectedLetter, nowMs: number): boolean {
  return expected.state === 'expected' && nowMs >= expected.askOn;
}
