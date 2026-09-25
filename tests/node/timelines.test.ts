/**
 * Dates a letter implies but does not print: second chances and expected letters.
 *
 * AUTHORSHIP: Claude. Tests for src/lib/timelines.ts and the timelines pack.
 *
 * Pinned against corpus notice 02, a real NA 960X discontinuance run through
 * Apple Vision, because the rules that depend on the letter's own wording have
 * to be tested against wording the recogniser actually produced. Every date is
 * checked in local calendar days across the November daylight-saving change,
 * where a millisecond count lands an hour short of midnight on the wrong day.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseTimelines } from '../../src/lib/content/parse.ts';
import {
  addDays,
  addMonths,
  arrivalMatches,
  firstOfMonthAfter,
  followupFireTime,
  forecastLetters,
  programMatches,
  secondChancesFor,
} from '../../src/lib/timelines.ts';
import type { NoticeFacts } from '../../src/lib/timelines.ts';
import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

const pack = parseTimelines(JSON.parse(readFileSync(join(REPO_ROOT, 'content/timelines.json'), 'utf8')));
const day = (y: number, m: number, d: number, h = 0, min = 0): number => new Date(y, m - 1, d, h, min).getTime();
const iso = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Corpus notice 02, as Review would save it, with the text the recogniser read. */
function notice02(): NoticeFacts {
  const ocr = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/corpus/ocr/apple-vision/na960x-clean-06.jpg.json'), 'utf8')) as {
    lines: { text: string }[];
  };
  return {
    programId: 'CalFresh',
    actionType: 'discontinuance',
    formId: 'NA 960X SAR',
    noticeDate: day(2026, 9, 8),
    effectiveDate: day(2026, 9, 30),
    deadlineDate: day(2026, 9, 30),
    text: ocr.lines.map((l) => l.text).join('\n'),
  };
}

describe('the timelines pack', () => {
  it('parses, and every rule carries its source in its own words', () => {
    expect(pack.secondChances.length).toBeGreaterThanOrEqual(4);
    for (const rule of [...pack.secondChances, ...pack.expectedLetters]) {
      expect(rule.sourceUrl.startsWith('https://')).toBe(true);
      expect(rule.ruleText.length).toBeGreaterThan(40);
      expect(rule.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rule.titleEs.length).toBeGreaterThan(0);
    }
  });

  it('marks every rule it is not sure of, so the ship gate lists it', () => {
    for (const rule of [...pack.secondChances, ...pack.expectedLetters]) {
      if (rule.confidence !== 'high') expect(rule.todoVerify).toBeDefined();
    }
  });

  it('refuses a rule with both a day and a month offset', () => {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'content/timelines.json'), 'utf8')) as {
      second_chances: Record<string, unknown>[];
    };
    raw.second_chances[0]!['offset'] = { days: 30, months: 1 };
    expect(() => parseTimelines(raw)).toThrow(/exactly one/);
  });

  it('refuses a rule with no source', () => {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'content/timelines.json'), 'utf8')) as {
      second_chances: Record<string, unknown>[];
    };
    delete raw.second_chances[0]!['source_url'];
    expect(() => parseTimelines(raw)).toThrow();
  });

  it('refuses two rules with the same id', () => {
    const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'content/timelines.json'), 'utf8')) as {
      second_chances: Record<string, unknown>[];
    };
    raw.second_chances.push({ ...raw.second_chances[0]! });
    expect(() => parseTimelines(raw)).toThrow(/duplicate/i);
  });
});

describe('second chances on corpus notice 02 (CalFresh stopped for a missing SAR 7)', () => {
  const chances = secondChancesFor(notice02(), pack.secondChances, day(2026, 9, 10));
  const byId = new Map(chances.map((c) => [c.rule.id, c]));

  it('offers the restore window: 30 days from the stop date', () => {
    expect(iso(byId.get('calfresh_restore_after_stop')!.dateMs)).toBe('2026-10-30');
  });

  it('offers the good-cause window, because the letter says SAR 7', () => {
    expect(iso(byId.get('calfresh_good_cause_late_report')!.dateMs)).toBe('2026-10-30');
  });

  it('offers the outer hearing limit, because the letter counts 90 days from its own date', () => {
    expect(iso(byId.get('hearing_good_cause_outer_limit')!.dateMs)).toBe('2027-03-07');
  });

  it('offers nothing for Medi-Cal on a CalFresh letter', () => {
    expect(byId.has('medi_cal_cure_period')).toBe(false);
  });

  it('lists them soonest first, none yet passed', () => {
    const dates = chances.map((c) => c.dateMs);
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    expect(chances.every((c) => !c.passed)).toBe(true);
  });

  it('marks a date as passed the day after it, never on it', () => {
    const on = secondChancesFor(notice02(), pack.secondChances, day(2026, 10, 30, 23, 59));
    expect(on.find((c) => c.rule.id === 'calfresh_restore_after_stop')?.passed).toBe(false);
    const after = secondChancesFor(notice02(), pack.secondChances, day(2026, 10, 31, 0, 1));
    expect(after.find((c) => c.rule.id === 'calfresh_restore_after_stop')?.passed).toBe(true);
  });
});

describe('second chances apply only when everything they need is confirmed', () => {
  it('gives nothing without the anchor date, rather than falling back to another date', () => {
    const facts = { ...notice02() };
    delete (facts as { effectiveDate?: number }).effectiveDate;
    const ids = secondChancesFor(facts, pack.secondChances, day(2026, 9, 10)).map((c) => c.rule.id);
    expect(ids).toEqual(['hearing_good_cause_outer_limit']);
  });

  it('skips the wording-dependent rules when the text is not stored', () => {
    const facts = { ...notice02() };
    delete (facts as { text?: string }).text;
    const ids = secondChancesFor(facts, pack.secondChances, day(2026, 9, 10)).map((c) => c.rule.id);
    expect(ids).toEqual(['calfresh_restore_after_stop']);
  });

  it('stops offering the restore window once the waiver has ended', () => {
    const facts = { ...notice02(), effectiveDate: day(2027, 7, 31) };
    const ids = secondChancesFor(facts, pack.secondChances, day(2027, 7, 1)).map((c) => c.rule.id);
    expect(ids).not.toContain('calfresh_restore_after_stop');
  });

  it('gives nothing on an approval', () => {
    expect(secondChancesFor({ ...notice02(), actionType: 'approval' }, pack.secondChances, day(2026, 9, 10))).toEqual([]);
  });

  it('gives Medi-Cal its 90 days, across the change back from daylight time', () => {
    const facts: NoticeFacts = { programId: 'Medi-Cal', actionType: 'discontinuance', effectiveDate: day(2026, 10, 31) };
    const cure = secondChancesFor(facts, pack.secondChances, day(2026, 10, 1)).find((c) => c.rule.id === 'medi_cal_cure_period');
    expect(iso(cure!.dateMs)).toBe('2027-01-29');
    expect(new Date(cure!.dateMs).getHours()).toBe(0);
  });
});

describe('the letter a SAR 7 implies is coming', () => {
  const sar7: NoticeFacts = {
    programId: 'CalFresh/CalWORKs',
    actionType: 'recert_due',
    formId: 'SAR 7',
    deadlineDate: day(2026, 9, 5),
  };

  it('expects the renewal notice in the next-to-last month of a 12-month period', () => {
    const [forecast] = forecastLetters(sar7, pack.expectedLetters);
    expect(forecast).toBeDefined();
    expect(iso(forecast!.expectFromMs)).toBe('2027-02-01');
    expect(iso(forecast!.expectByMs)).toBe('2027-03-01');
    // A week of mail after the window closes before asking.
    expect(iso(forecast!.askOnMs)).toBe('2027-03-08');
  });

  it('forecasts nothing from a letter that is not a SAR 7', () => {
    expect(forecastLetters({ ...sar7, formId: 'CF 377.6' }, pack.expectedLetters)).toEqual([]);
    expect(forecastLetters({ ...sar7, programId: 'Medi-Cal' }, pack.expectedLetters)).toEqual([]);
  });

  it('counts a CalFresh scan in a generous window as the letter arriving', () => {
    const [forecast] = forecastLetters(sar7, pack.expectedLetters);
    const expected = { programs: ['CalFresh'], expectFromMs: forecast!.expectFromMs, askOnMs: forecast!.askOnMs };
    expect(arrivalMatches(expected, { programId: 'CalFresh', capturedAt: day(2027, 2, 14) })).toBe(true);
    expect(arrivalMatches(expected, { programId: 'CalFresh', capturedAt: day(2026, 12, 20) })).toBe(true);
    expect(arrivalMatches(expected, { programId: 'Medi-Cal', capturedAt: day(2027, 2, 14) })).toBe(false);
    expect(arrivalMatches(expected, { programId: 'CalFresh', capturedAt: day(2026, 10, 1) })).toBe(false);
  });
});

describe('calendar arithmetic', () => {
  it('adds days in local calendar days across the daylight-saving change', () => {
    // November 1, 2026 is 25 hours long in Los Angeles.
    expect(iso(addDays(day(2026, 10, 15), 30))).toBe('2026-11-14');
    expect(new Date(addDays(day(2026, 10, 15), 30)).getHours()).toBe(0);
    expect(iso(addDays(day(2026, 3, 1), 30))).toBe('2026-03-31');
  });

  it('clamps a month to the end of a short one, which is always earlier and never later', () => {
    expect(iso(addMonths(day(2027, 1, 31), 1))).toBe('2027-02-28');
    expect(iso(addMonths(day(2028, 1, 31), 1))).toBe('2028-02-29');
    expect(iso(addMonths(day(2026, 9, 30), 1))).toBe('2026-10-30');
  });

  it('finds the first of a month several months on', () => {
    expect(iso(firstOfMonthAfter(day(2026, 9, 5), 5))).toBe('2027-02-01');
  });

  it('matches a programme however the letter spells it', () => {
    expect(programMatches('CalFresh/CalWORKs', ['CalFresh'])).toBe(true);
    expect(programMatches('Medi-Cal', ['Medi-Cal'])).toBe(true);
    expect(programMatches('MEDI CAL', ['Medi-Cal'])).toBe(true);
    expect(programMatches(undefined, ['CalFresh'])).toBe(false);
  });
});

describe('when to remind someone about a second-chance date', () => {
  const target = day(2026, 10, 30);

  it('three days before, at their reminder time', () => {
    expect(followupFireTime(target, day(2026, 10, 1), 9, 30)).toBe(day(2026, 10, 27, 9, 30));
  });

  it('the day before, if three days before has gone', () => {
    expect(followupFireTime(target, day(2026, 10, 27, 12), 9, 0)).toBe(day(2026, 10, 29, 9, 0));
  });

  it('the morning of the last day, if that is all that is left', () => {
    expect(followupFireTime(target, day(2026, 10, 29, 12), 9, 0)).toBe(day(2026, 10, 30, 9, 0));
  });

  it('never, once the last reminder time has passed', () => {
    expect(followupFireTime(target, day(2026, 10, 30, 10), 9, 0)).toBeUndefined();
  });
});
