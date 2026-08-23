/**
 * Content pack validation.
 *
 * AUTHORSHIP: Claude. App-side code.
 *
 * The rule this file exists to enforce, from CLAUDE.md §16:
 *
 *   > Never invent a form ID, a deadline rule, a regulation citation, an appeal
 *   > window, a program eligibility rule, or an office's hours.
 *
 * A JSON file is easy to edit and nothing stops a plausible-looking entry with
 * no source from being added. So every entry is validated on load: no source
 * URL, no verification date, or an unrecognised confidence value and the load
 * throws. `tests/node/content.test.ts` runs this over the real files on every
 * `npm test`, which turns "we should keep this sourced" into a build failure.
 *
 * The phrasing check is the one worth reading twice. SPEC §10 forbids
 * eligibility screening, and §2.1 allows a cross-reference only at population
 * level — "people receiving X are often also eligible for Y", never "you may
 * qualify". That is a one-word difference in copy and the entire difference
 * between a permitted feature and a forbidden one. It is checked mechanically
 * here rather than trusted to whoever writes the next entry.
 */

import type { Confidence, IsoDate } from './types.ts';

export class ContentError extends Error {
  constructor(where: string, problem: string) {
    super(`content: ${where} — ${problem}`);
    this.name = 'ContentError';
  }
}

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];

export function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContentError(where, 'missing or empty');
  }
  return value;
}

export function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, where);
}

export function requireIsoDate(value: unknown, where: string): IsoDate {
  const raw = requireString(value, where);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ContentError(where, `"${raw}" is not an ISO date`);
  }
  return raw;
}

export function requireConfidence(value: unknown, where: string): Confidence {
  const raw = requireString(value, where);
  if (!CONFIDENCES.includes(raw)) {
    throw new ContentError(where, `confidence "${raw}" is not one of ${CONFIDENCES.join(', ')}`);
  }
  return raw as Confidence;
}

/**
 * A source URL, which must be a real https link to the agency that operates the
 * programme — not a search result, not a blog, and not http.
 */
export function requireSourceUrl(value: unknown, where: string): string {
  const raw = requireString(value, where);
  if (!raw.startsWith('https://')) {
    throw new ContentError(where, `source_url must be https, got "${raw}"`);
  }
  return raw;
}

/**
 * Phrasing that turns a cross-reference into an eligibility determination.
 *
 * Second person plus an eligibility verb is the line. "People receiving
 * CalFresh are often also eligible for WIC" is a fact about a population.
 * "You may be eligible for WIC" is a claim about this household, which Carta is
 * in no position to make and which SPEC §10 forbids outright.
 */
const FORBIDDEN_PHRASING: readonly (readonly [RegExp, string])[] = [
  [/\byou (?:may |might |could |probably )?qualify\b/i, '"you qualify"'],
  [/\byou(?:'re| are)? (?:may |might |likely )?eligible\b/i, '"you are eligible"'],
  [/\byou (?:may|might|could) be eligible\b/i, '"you may be eligible"'],
  [/\byour household qualifies\b/i, '"your household qualifies"'],
  [/\busted (?:puede )?califica\b/i, '"usted califica"'],
  [/\bpuede calificar\b/i, '"puede calificar"'],
  [/\bes elegible\b/i, '"es elegible"'],
];

/**
 * Throws if copy addresses the reader's own eligibility.
 *
 * Applied to the user-visible strings of every cross-reference entry. Not
 * applied to `basis`, which is an internal justification quoting a regulation
 * and legitimately says things like "receipt of CalFresh establishes adjunctive
 * income eligibility" — a statement about the rule, not about the reader.
 */
export function requirePopulationLevelPhrasing(text: string, where: string): string {
  for (const [pattern, description] of FORBIDDEN_PHRASING) {
    if (pattern.test(text)) {
      throw new ContentError(
        where,
        `uses individual eligibility phrasing ${description}. SPEC §10 permits a ` +
          'cross-reference keyed on programme and county, not a determination about ' +
          'this household. Rephrase at population level: "people receiving X are ' +
          'often also eligible for Y".',
      );
    }
  }
  return text;
}

/**
 * How stale a verification date is, in whole days, against a supplied clock.
 * The clock is a parameter so this is testable and so nothing here reads a
 * global — the same discipline the extraction island is held to.
 */
export function daysSinceVerified(verifiedOn: IsoDate, nowMs: number): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(verifiedOn);
  if (!parts) throw new ContentError(verifiedOn, 'not an ISO date');
  const then = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getTime();
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - then) / 86_400_000);
}

/**
 * Beyond this, an office's hours and address are old enough that the UI should
 * say so. Six months is chosen against the harm: a stale phone number wastes a
 * call, a stale address wastes a trip.
 */
export const STALE_AFTER_DAYS = 183;

export function isStale(verifiedOn: IsoDate, nowMs: number): boolean {
  return daysSinceVerified(verifiedOn, nowMs) > STALE_AFTER_DAYS;
}
