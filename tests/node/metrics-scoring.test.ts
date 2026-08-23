/**
 * The scoring math and the value comparators.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * A metrics harness that scores wrongly is worse than none — it produces a
 * number that looks like evidence. These tests pin the comparisons that decide
 * whether a read counts as correct, using the exact surface forms the corpus
 * actually prints.
 */

import {
  dateSurfaceForms,
  dateToIso,
  moneySurfaceForms,
  moneyToCents,
  orderedFields,
  specFor,
  squash,
  surfaceForms,
  valuesMatch,
} from '../../tools/metrics/fields.ts';
import { aggregate, precision, recall, scoreImage, truthFields } from '../../tools/metrics/score.ts';
import type { CaptureEntry, NoticeTruth } from '../../tools/metrics/corpus.ts';
import type { Extractor } from '../../tools/metrics/extractor.ts';
import { nullExtractor } from '../../tools/metrics/extractor.ts';
import type { OcrRecord } from '../../tools/metrics/ocr-cache.ts';

describe('value comparison tolerates formatting, not error', () => {
  it('matches a date whatever form the extractor emits', () => {
    expect(valuesMatch('deadline_date', '2026-09-05', '2026-09-05')).toBe(true);
    // MM/DD/YYYY is what the GBNF grammar constrains a date field to.
    expect(valuesMatch('deadline_date', '2026-09-05', '09/05/2026')).toBe(true);
    expect(valuesMatch('deadline_date', '2026-09-05', '9/5/2026')).toBe(true);
  });

  it('rejects a date that is one day off', () => {
    // The whole product is this date. A day early is a wasted trip; a day late
    // is a closed case.
    expect(valuesMatch('deadline_date', '2026-09-05', '2026-09-06')).toBe(false);
    expect(valuesMatch('deadline_date', '2026-09-05', '2026-09-04')).toBe(false);
  });

  it('rejects an unparseable value rather than throwing', () => {
    expect(valuesMatch('deadline_date', '2026-09-05', 'next Thursday')).toBe(false);
    expect(valuesMatch('deadline_date', '2026-09-05', '')).toBe(false);
  });

  it('compares money numerically', () => {
    expect(valuesMatch('gross_income', '1847.20', '$1,847.20')).toBe(true);
    expect(valuesMatch('gross_income', '1847.20', '1847.2')).toBe(true);
    // Notice 10 prints "$2,510" for a truth value of "2510.00".
    expect(valuesMatch('income_reporting_threshold', '2510.00', '$2,510')).toBe(true);
    expect(valuesMatch('gross_income', '1847.20', '1847.02')).toBe(false);
  });

  it('compares ids and text after squashing punctuation and case', () => {
    expect(valuesMatch('case_number', '01-4472-9931', '01-4472-9931')).toBe(true);
    expect(valuesMatch('case_number', '01-4472-9931', '0144729931')).toBe(true);
    expect(valuesMatch('case_number', '01-4472-9931', '01-4472-9932')).toBe(false);
    expect(valuesMatch('program', 'CalFresh/CalWORKs', 'CalFresh / CalWORKs')).toBe(true);
  });

  it('compares times across 12- and 24-hour notation', () => {
    expect(valuesMatch('appointment_time', '10:30', '10:30 AM')).toBe(true);
    expect(valuesMatch('appointment_time', '10:30', '10:30')).toBe(true);
    expect(valuesMatch('appointment_time', '10:30', '10:30 PM')).toBe(false);
  });
});

describe('surface forms cover how the corpus actually prints values', () => {
  it('generates the English and Spanish date forms the notices use', () => {
    const forms = dateSurfaceForms('2026-09-05').map(squash);
    expect(forms).toContain(squash('SEPTEMBER 5, 2026')); // notice 01
    expect(forms).toContain(squash('5 DE SEPTIEMBRE DE 2026')); // notice 06
  });

  it('generates the bilingual notice\'s two forms of one date', () => {
    const forms = dateSurfaceForms('2026-10-12').map(squash);
    expect(forms).toContain(squash('October 12, 2026'));
    expect(forms).toContain(squash('12 de octubre de 2026'));
  });

  it('generates a whole-dollar form only when there are no cents', () => {
    expect(moneySurfaceForms('2510.00').map(squash)).toContain(squash('$2,510'));
    expect(moneySurfaceForms('1847.20').map(squash)).not.toContain(squash('$1,847'));
  });

  it('squashes to letters and digits, stripping diacritics', () => {
    expect(squash('Case Number:  01-4472-9931')).toBe('CASENUMBER0144729931');
    expect(squash('español')).toBe('ESPANOL');
    expect(squash('12 de octubre de 2026')).toBe('12DEOCTUBREDE2026');
  });

  it('leaves plain text alone', () => {
    expect(surfaceForms('recipient_name', 'MARIA REYES')).toEqual(['MARIA REYES']);
  });

  it('parses money and dates back, or returns undefined', () => {
    expect(moneyToCents('$1,847.20')).toBe(184720);
    expect(moneyToCents('not money')).toBeUndefined();
    expect(dateToIso('10/06/2026')).toBe('2026-10-06');
    expect(dateToIso('sometime')).toBeUndefined();
  });
});

describe('field taxonomy', () => {
  it('classifies the appeal deadline as derived, not printed', () => {
    // No notice prints it. Scoring it against the OCR ceiling would report a
    // recogniser failure for a value that was never on the page.
    expect(specFor('appeal_deadline').evidence).toBe('derived');
    expect(specFor('deadline_date').evidence).toBe('printed');
    expect(specFor('required_docs').evidence).toBe('semantic');
  });

  it('leads the report with the fields that drive scheduling', () => {
    const ordered = orderedFields(['employer', 'deadline_date', 'agency', 'case_number']);
    expect(ordered[0]).toBe('deadline_date');
    expect(ordered).toEqual(['deadline_date', 'case_number', 'agency', 'employer']);
  });

  it('refuses to score a field it has never heard of', () => {
    expect(() => specFor('invented_field')).toThrow(/no field spec/);
  });
});

// ------------------------------------------------------------------ fixtures

const notice: NoticeTruth = {
  file: '01-test.pdf',
  form_id: 'SAR 7',
  program: 'CalFresh',
  agency: 'Santa Clara County HHSA',
  language: 'en',
  action_type: 'recert_due',
  fields: {
    recipient_name: 'MARIA REYES',
    deadline_date: '2026-09-05',
    required_docs: ['pay_stub', 'utility_bill'],
  },
  note: '',
};

const capture: CaptureEntry = {
  file: 'test.jpg',
  notice: '01',
  bucket: 'real',
  condition: 'flat',
};

function record(text: string): OcrRecord {
  return {
    file: 'test.jpg',
    engine: 'test',
    sourceWidth: 2000,
    sourceHeight: 2666,
    ocrWidth: 1700,
    ocrHeight: 2266,
    maxWidth: 1700,
    lines: text.split('\n').map((line) => ({
      text: line,
      confidence: 1,
      box: { x: 0, y: 0, w: 1, h: 0.01 },
    })),
  };
}

const PAGE = 'MARIA REYES\nSUBMIT BY: SEPTEMBER 5, 2026\nSAR 7\nCalFresh';

function fixedExtractor(fields: Record<string, string>, docs?: string[]): Extractor {
  return {
    id: 'test',
    run: () => ({
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])),
      ...(docs === undefined ? {} : { requiredDocs: docs }),
    }),
  };
}

describe('scoring one image', () => {
  it('counts a right answer as a true positive', () => {
    const score = scoreImage(
      capture,
      notice,
      record(PAGE),
      fixedExtractor({ deadline_date: '09/05/2026' }),
    );
    expect(score.perField.get('deadline_date')).toEqual({ tp: 1, fp: 0, fn: 0 });
  });

  it('counts a missing answer as a false negative only', () => {
    const score = scoreImage(capture, notice, record(PAGE), nullExtractor);
    expect(score.perField.get('deadline_date')).toEqual({ tp: 0, fp: 0, fn: 1 });
  });

  it('counts a wrong answer as both a false positive and a false negative', () => {
    // Deliberate: a confidently wrong deadline is worse than a blank one, and
    // the arithmetic should say so in both directions.
    const score = scoreImage(
      capture,
      notice,
      record(PAGE),
      fixedExtractor({ deadline_date: '2026-09-06' }),
    );
    expect(score.perField.get('deadline_date')).toEqual({ tp: 0, fp: 1, fn: 1 });
  });

  it('counts an invented field as a false positive', () => {
    // The cascade producing an aid-paid-pending date for a notice that has none
    // is the failure CLAUDE.md §4 forbids outright.
    const score = scoreImage(
      capture,
      notice,
      record(PAGE),
      fixedExtractor({ aid_paid_pending_deadline: '2026-09-15' }),
    );
    expect(score.spurious).toEqual(['aid_paid_pending_deadline']);
    expect(score.perField.get('aid_paid_pending_deadline')).toEqual({ tp: 0, fp: 1, fn: 0 });
  });

  it('scores a document list item by item, so half right is half', () => {
    const score = scoreImage(
      capture,
      notice,
      record(PAGE),
      fixedExtractor({}, ['pay_stub', 'photo_id']),
    );
    // pay_stub right, utility_bill missed, photo_id invented.
    expect(score.perField.get('required_docs')).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it('reports the OCR ceiling only for printed fields', () => {
    const score = scoreImage(capture, notice, record(PAGE), nullExtractor);
    expect(score.ceiling.get('deadline_date')).toBe(true);
    expect(score.ceiling.get('recipient_name')).toBe(true);
    // Semantic and list fields have no string to find on the page.
    expect(score.ceiling.has('required_docs')).toBe(false);
    expect(score.ceiling.has('agency')).toBe(false);
  });

  it('records a ceiling miss when the value is not in the text', () => {
    const score = scoreImage(capture, notice, record('SAR 7\nCalFresh'), nullExtractor);
    expect(score.ceiling.get('deadline_date')).toBe(false);
    expect(score.ceiling.get('recipient_name')).toBe(false);
  });
});

describe('aggregation and rates', () => {
  it('reports no-data as undefined rather than zero', () => {
    // "We produced nothing, so precision is 0%" would be a lie about a
    // measurement that was never taken.
    expect(precision({ tp: 0, fp: 0, fn: 5 })).toBeUndefined();
    expect(recall({ tp: 0, fp: 3, fn: 0 })).toBeUndefined();
    expect(recall({ tp: 0, fp: 0, fn: 5 })).toBe(0);
  });

  it('keeps conditions separate when aggregating', () => {
    const flat = scoreImage(capture, notice, record(PAGE), fixedExtractor({ deadline_date: '2026-09-05' }));
    const creased = scoreImage(
      { ...capture, file: 'other.jpg', condition: 'creased' },
      notice,
      record(PAGE),
      nullExtractor,
    );
    const agg = aggregate([flat, creased]);
    const perCondition = agg.byFieldCondition.get('deadline_date');
    expect(recall(perCondition!.get('flat')!.counts)).toBe(1);
    expect(recall(perCondition!.get('creased')!.counts)).toBe(0);
    expect(recall(agg.byField.get('deadline_date')!.counts)).toBe(0.5);
  });
});

describe('truth flattening', () => {
  it('brings notice-level attributes into the same namespace as the fields', () => {
    const flat = truthFields(notice);
    expect(flat.get('form_id')).toBe('SAR 7');
    expect(flat.get('action_type')).toBe('recert_due');
    expect(flat.get('deadline_date')).toBe('2026-09-05');
  });
});
