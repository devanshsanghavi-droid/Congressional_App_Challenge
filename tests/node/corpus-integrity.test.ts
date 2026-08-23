/**
 * The corpus, checked against itself.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * The metrics table is only worth as much as the mapping underneath it. If a
 * photograph is added, renamed, or dropped and tools/metrics/corpus.ts is not
 * updated, that image silently stops being measured — and a metrics table that
 * quietly covers 21 of 23 captures while claiming 23 is worse than no table.
 * These tests read what is actually on disk.
 *
 * They also carry the two structural assertions the corpus README asks for:
 * the Maria Reyes case chain, and the approval notice that must not be made to
 * look urgent.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  APPROVAL_NOTICE,
  CASE_CHAIN,
  CONTROLLED_SET,
  CORPUS_DIR,
  REAL_CAPTURES,
  REPEATABILITY_PAIR,
  loadCorpus,
} from '../../tools/metrics/corpus.ts';
import { FIELD_SPECS, specFor } from '../../tools/metrics/fields.ts';
import { checkApproval, checkCaseChain, datesOf, isoToLocalMs } from '../../tools/metrics/logic.ts';
import { truthFields } from '../../tools/metrics/score.ts';
import { countdownTier, daysUntil, isUrgent, remindersFor } from '../../src/lib/urgency.ts';

const corpus = loadCorpus();

function jpegsIn(dir: string): string[] {
  return readdirSync(join(CORPUS_DIR, dir))
    .filter((name) => name.endsWith('.jpg'))
    .sort();
}

describe('corpus mapping covers what is on disk', () => {
  it('maps every real capture, and maps nothing that is missing', () => {
    const onDisk = jpegsIn('photos');
    const mapped = REAL_CAPTURES.map((capture) => capture.file).sort();
    expect(mapped).toEqual(onDisk);
  });

  it('maps every synthetic variant', () => {
    const onDisk = jpegsIn('photos/synthetic');
    const mapped = corpus.captures
      .filter((capture) => capture.bucket === 'synthetic')
      .map((capture) => capture.file)
      .sort();
    expect(mapped).toEqual(onDisk);
  });

  it('keeps the two buckets separate and non-empty', () => {
    const real = corpus.captures.filter((c) => c.bucket === 'real');
    const synthetic = corpus.captures.filter((c) => c.bucket === 'synthetic');
    expect(real).toHaveLength(23);
    expect(synthetic).toHaveLength(56);
    // No file may be in both buckets — that would double-count it into the
    // headline number, which is the one thing the corpus README forbids.
    const realFiles = new Set(real.map((c) => c.file));
    expect(synthetic.some((c) => realFiles.has(c.file))).toBe(false);
  });

  it('derives every synthetic variant from a real capture that exists', () => {
    const realFiles = new Set(REAL_CAPTURES.map((c) => c.file));
    for (const capture of corpus.captures) {
      if (capture.bucket !== 'synthetic') continue;
      expect(capture.derivedFrom).toBeDefined();
      expect(realFiles.has(capture.derivedFrom as string)).toBe(true);
    }
  });

  it('has ground truth for every notice a capture points at', () => {
    for (const capture of corpus.captures) {
      expect(corpus.notices.get(capture.notice)).toBeDefined();
    }
  });
});

describe('ground truth is fully described by the field taxonomy', () => {
  it('has a field spec for every key in the corpus', () => {
    const unknown = new Set<string>();
    for (const notice of corpus.notices.values()) {
      for (const field of truthFields(notice).keys()) {
        if (!(field in FIELD_SPECS)) unknown.add(field);
      }
    }
    // A new field in the corpus with no spec would be scored with the wrong
    // comparator, or silently skipped. Fail loudly instead.
    expect([...unknown]).toEqual([]);
  });

  it('holds the appeal-deadline rule the corpus actually follows', () => {
    // Every appeal_deadline in the corpus is notice_date + 90 days. That is
    // why the field is classified `derived`: it is nowhere on the page, it is
    // computed from the printed sentence "within 90 days of the date of this
    // notice". If a regenerated corpus broke that rule, classifying it as
    // derived would become wrong, so the rule is asserted rather than assumed.
    expect(specFor('appeal_deadline').evidence).toBe('derived');
    let checked = 0;
    for (const notice of corpus.notices.values()) {
      const appeal = notice.fields['appeal_deadline'];
      const noticeDate = notice.fields['notice_date'];
      if (typeof appeal !== 'string' || typeof noticeDate !== 'string') continue;
      // daysUntil, not a millisecond division: Aug 24 -> Nov 22 crosses the
      // end of daylight saving, so one of those days is 25 hours long and the
      // naive arithmetic gives 90.04. Getting this wrong in the app would mean
      // an appeal deadline off by a day.
      expect(daysUntil(isoToLocalMs(appeal), isoToLocalMs(noticeDate))).toBe(90);
      checked += 1;
    }
    expect(checked).toBe(4);
  });
});

describe('the controlled comparison is genuinely controlled', () => {
  it('is five captures of one physical sheet', () => {
    expect(CONTROLLED_SET).toHaveLength(5);
    const notices = new Set(CONTROLLED_SET.map((file) => corpus.byFile.get(file)?.notice));
    expect([...notices]).toEqual(['01']);
  });

  it('covers five distinct conditions', () => {
    const conditions = CONTROLLED_SET.map((file) => corpus.byFile.get(file)?.condition);
    expect(new Set(conditions).size).toBe(5);
  });

  it('is entirely real captures — a synthetic variant here would break the isolation', () => {
    for (const file of CONTROLLED_SET) {
      expect(corpus.byFile.get(file)?.bucket).toBe('real');
    }
  });

  it('pairs two takes of one sheet under one condition for the error bar', () => {
    const [a, b] = REPEATABILITY_PAIR;
    const first = corpus.byFile.get(a);
    const second = corpus.byFile.get(b);
    expect(first?.notice).toBe(second?.notice);
    expect(first?.condition).toBe(second?.condition);
    expect(first?.bucket).toBe('real');
  });
});

describe('notices 01 and 02 chain — the demo narrative', () => {
  const { checks, warnings } = checkCaseChain(corpus);

  it.each(checks.map((check) => [check.name, check]))('%s', (_name, check) => {
    expect(check).toMatchObject({ passed: true });
  });

  it('links the two notices through one case number', () => {
    const cause = corpus.notices.get(CASE_CHAIN.cause);
    const consequence = corpus.notices.get(CASE_CHAIN.consequence);
    expect(cause?.fields['case_number']).toBe(CASE_CHAIN.caseNumber);
    expect(consequence?.fields['case_number']).toBe(CASE_CHAIN.caseNumber);
    // The consequence has to be reachable from the cause by case number alone,
    // because that is all the app will have: two photographs taken weeks apart.
    const sameCase = [...corpus.notices.values()].filter(
      (notice) => notice.fields['case_number'] === CASE_CHAIN.caseNumber,
    );
    expect(sameCase.map((notice) => notice.action_type).sort()).toEqual([
      'discontinuance',
      'recert_due',
    ]);
  });

  it('is chronologically coherent — the notice postdates the deadline it cites', () => {
    // Fixed 2026-08-18: notice 02 used to be dated 2026-08-24 while citing a
    // SAR 7 deadline of 2026-09-05, a notice reporting a failure that had not
    // happened yet. Now 2026-09-08, three days after.
    //
    // This assertion is also a guard. `tools/corpus/tools/make_corpus.py` was
    // NOT updated with the fix — it still hardcodes AUGUST 24, 2026 — so
    // re-running the generator would silently reintroduce the defect and
    // overwrite the corrected ground truth. That would fail here.
    expect(warnings).toEqual([]);

    const consequence = corpus.notices.get(CASE_CHAIN.consequence);
    const cause = corpus.notices.get(CASE_CHAIN.cause);
    expect(consequence?.fields['notice_date']).toBe('2026-09-08');
    expect(
      daysUntil(
        isoToLocalMs(consequence?.fields['notice_date'] as string),
        isoToLocalMs(cause?.fields['deadline_date'] as string),
      ),
    ).toBe(3);
  });

  it('keeps the ten-day aid-paid-pending window on the corrected notice', () => {
    // The highest-stakes number in the app (CLAUDE.md §16). Ten days from the
    // notice date, and it has to land before the action takes effect or the
    // window is meaningless.
    const consequence = corpus.notices.get(CASE_CHAIN.consequence);
    const noticeDate = isoToLocalMs(consequence?.fields['notice_date'] as string);
    const app = isoToLocalMs(consequence?.fields['aid_paid_pending_deadline'] as string);
    const effective = isoToLocalMs(consequence?.fields['effective_date'] as string);
    expect(daysUntil(app, noticeDate)).toBe(10);
    expect(app).toBeLessThan(effective);
  });
});

describe('notice 10 is an approval and must not be dressed up as urgent', () => {
  const { checks } = checkApproval(corpus);

  it.each(checks.map((check) => [check.name, check]))('%s', (_name, check) => {
    expect(check).toMatchObject({ passed: true });
  });

  it('stays quiet at every point in its own life, not just one clock', () => {
    const approval = corpus.notices.get(APPROVAL_NOTICE);
    expect(approval?.action_type).toBe('approval');
    const dates = datesOf(approval!);

    // Sweep a year at weekly intervals, so this cannot pass by having picked a
    // flattering date. It must be quiet on the day the appeal window closes and
    // on the day the certification period ends — the two dates most likely to
    // be mistaken for deadlines by a future change to the scheduling rules.
    for (let week = 0; week < 60; week++) {
      const clock = new Date(2026, 7, 12, 9, 0, 0, 0).getTime() + week * 7 * 86_400_000;
      expect(countdownTier(dates, clock)).toBe('none');
      expect(remindersFor(dates, clock)).toEqual([]);
      expect(isUrgent(dates, clock)).toBe(false);
    }
  });
});
