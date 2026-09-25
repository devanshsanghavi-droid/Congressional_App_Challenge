/**
 * Dates a confirmed notice implies but does not print.
 *
 * AUTHORSHIP: Claude. App-side, pure (no store, no clock, no platform), so the
 * Node tests pin every date against the corpus notices.
 *
 * Two kinds, both driven by `content/timelines.json`, where every rule carries
 * its source and its own words:
 *
 *   - **Second chances.** A notice that stops benefits usually leaves a way back:
 *     turn the missing form in within 30 days and CalFresh can restart; return a
 *     Medi-Cal renewal within 90 days and coverage picks up with no gap. The
 *     letter states the stop date; the rule states the window. Carta joins them.
 *
 *   - **Expected letters.** A confirmed SAR 7 implies a renewal notice about
 *     five months later. If that month passes and nothing has been scanned, the
 *     letter may be lost, and 47% of respondents to DHCS's survey of people dropped
 *     from Medi-Cal said they never received a renewal form. Carta cannot see the
 *     mail, but it can notice the gap and ask.
 *
 * Every date here is counted in local calendar days and months, never in
 * milliseconds, for the reason urgency.ts gives: across a daylight-saving change
 * `(a - b) / 86400000` is not a whole number of days.
 */

import { isoToLocalMs } from './dates.ts';
import type { ExpectedLetterRule, SecondChanceRule, TimelineAnchor } from './content/types.ts';

/** What the rules need to know about a confirmed notice. */
export interface NoticeFacts {
  readonly programId?: string;
  readonly actionType: string;
  readonly formId?: string;
  readonly effectiveDate?: number;
  readonly noticeDate?: number;
  readonly deadlineDate?: number;
  /** The notice's recognised text, when it was stored. Some rules apply only if it says certain words. */
  readonly text?: string;
}

const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "CalFresh/CalWORKs" is a CalFresh notice and a CalWORKs notice. "Medi-Cal" is "medical". */
export function programMatches(programId: string | undefined, programs: readonly string[]): boolean {
  if (programId === undefined) return false;
  const notice = key(programId);
  return programs.some((p) => notice.includes(key(p)));
}

const sameForm = (a: string | undefined, b: string): boolean =>
  a !== undefined && key(a.replace(/\(.*$/, '')) === key(b.replace(/\(.*$/, ''));

function anchorMs(facts: NoticeFacts, anchor: TimelineAnchor): number | undefined {
  switch (anchor) {
    case 'effective_date':
      return facts.effectiveDate;
    case 'notice_date':
      return facts.noticeDate;
    case 'deadline_date':
      return facts.deadlineDate;
  }
}

/** Local midnight `days` calendar days after `ms`. */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/**
 * The same day `months` calendar months later, clamped to the end of a short
 * month: January 31 plus one month is February 28 (or 29), never March 3. The
 * clamp always lands EARLIER, which is the safe direction for a deadline.
 */
export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)).getTime();
}

/** The first of the month, `months` months after the month containing `ms`. */
export function firstOfMonthAfter(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
}

function mentions(text: string | undefined, phrases: readonly string[]): boolean {
  if (text === undefined) return false;
  const flat = text.toLowerCase().replace(/\s+/g, ' ');
  return phrases.some((p) => flat.includes(p.toLowerCase().replace(/\s+/g, ' ')));
}

export interface SecondChance {
  readonly rule: SecondChanceRule;
  /** Local midnight of the last day, as epoch millis. */
  readonly dateMs: number;
  readonly passed: boolean;
}

/**
 * The second-chance dates a notice implies, soonest first.
 *
 * A rule applies only when everything it needs is confirmed: the programme and
 * the action type match, its anchor date was confirmed on Review, its waiver was
 * in force on that date, and (for rules that depend on the letter's own wording)
 * the stored text says so. A rule that cannot be anchored produces nothing; it
 * never falls back to a different date.
 */
export function secondChancesFor(
  facts: NoticeFacts,
  rules: readonly SecondChanceRule[],
  nowMs: number,
): SecondChance[] {
  const today = addDays(nowMs, 0);
  const out: SecondChance[] = [];
  for (const rule of rules) {
    if (!rule.actionTypes.includes(facts.actionType)) continue;
    if (!programMatches(facts.programId, rule.programs)) continue;
    if (rule.requiresText !== undefined && !mentions(facts.text, rule.requiresText)) continue;
    const anchor = anchorMs(facts, rule.anchor);
    if (anchor === undefined) continue;
    if (rule.validThrough !== undefined) {
      const limit = isoToLocalMs(rule.validThrough);
      if (limit === undefined || anchor > limit) continue;
    }
    const dateMs = 'days' in rule.offset ? addDays(anchor, rule.offset.days) : addMonths(anchor, rule.offset.months);
    out.push({ rule, dateMs, passed: dateMs < today });
  }
  return out.sort((a, b) => a.dateMs - b.dateMs);
}

export interface LetterForecast {
  readonly rule: ExpectedLetterRule;
  /** The letter should arrive on or after this... */
  readonly expectFromMs: number;
  /** ...and before this. */
  readonly expectByMs: number;
  /** When to ask "did it come?". */
  readonly askOnMs: number;
}

/** The letters a confirmed notice implies are coming next. */
export function forecastLetters(facts: NoticeFacts, rules: readonly ExpectedLetterRule[]): LetterForecast[] {
  const out: LetterForecast[] = [];
  for (const rule of rules) {
    if (!rule.actionTypes.includes(facts.actionType)) continue;
    if (!programMatches(facts.programId, rule.programs)) continue;
    if (!rule.formIds.some((f) => sameForm(facts.formId, f))) continue;
    const anchor = anchorMs(facts, rule.anchor);
    if (anchor === undefined) continue;
    const expectFromMs = firstOfMonthAfter(anchor, rule.expectFromMonth);
    const expectByMs = firstOfMonthAfter(anchor, rule.expectByMonth);
    out.push({ rule, expectFromMs, expectByMs, askOnMs: addDays(expectByMs, rule.askAfterDays) });
  }
  return out;
}

/** Days before the window opens and after the ask during which a scan still counts as the letter arriving. */
const EARLY_DAYS = 45;
const LATE_DAYS = 90;

/**
 * Does a newly saved notice look like the letter a forecast was waiting for?
 * Same programme, scanned in a generous window around when it was due. Loose on
 * purpose: a false "it came" costs one question not asked; a false "it never
 * came" sends someone to call the county about a letter they already have.
 */
export function arrivalMatches(
  expected: { readonly programs: readonly string[]; readonly expectFromMs: number; readonly askOnMs: number },
  notice: { readonly programId?: string; readonly capturedAt: number },
): boolean {
  if (!programMatches(notice.programId, expected.programs)) return false;
  return notice.capturedAt >= addDays(expected.expectFromMs, -EARLY_DAYS) && notice.capturedAt <= addDays(expected.askOnMs, LATE_DAYS);
}

/** The month a forecast letter is expected in, for "usually comes in February". */
export function expectedMonth(forecast: { readonly expectFromMs: number }): Date {
  return new Date(forecast.expectFromMs);
}

/**
 * When to remind someone about a second-chance date: three days before at their
 * reminder time; if that has passed, the day before; if that has passed, the
 * morning of the last day. Undefined once even that is gone: a reminder about a
 * window that has already closed would only frighten.
 */
export function followupFireTime(targetMs: number, nowMs: number, hour: number, minute: number): number | undefined {
  for (const daysBefore of [3, 1, 0]) {
    const day = addDays(targetMs, -daysBefore);
    const d = new Date(day);
    const fireAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime();
    if (fireAt > nowMs) return fireAt;
  }
  return undefined;
}
