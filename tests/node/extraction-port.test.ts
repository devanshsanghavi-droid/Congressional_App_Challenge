/**
 * The Review screen's field-standing rules.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * These encode a measurement rather than a preference, so they are worth
 * pinning: on 23 real photographs, deterministic extraction held 100% precision
 * on every date it schedules on and dropped to ~90% on `recipient_name` and
 * `case_number`, where the failures are OCR character misreads that arrive
 * looking plausible. If someone later collapses this into one confidence
 * number, these fail.
 */

import type { ExtractedNotice } from '../../src/lib/extraction-port/port.ts';
import {
  FIELD_RISK,
  effectiveRisk,
  fieldNeedingAttention,
} from '../../src/lib/extraction-port/port.ts';

const field = (value: string, extra: Record<string, unknown> = {}) =>
  ({ value, source: 'regex' as const, ...extra });

describe('risk is per field, from measurement', () => {
  it('treats the two identity fields as high risk and the dates as verified', () => {
    expect(FIELD_RISK.recipientName).toBe('high');
    expect(FIELD_RISK.caseNumber).toBe('high');
    expect(FIELD_RISK.deadlineDate).toBe('verified');
    expect(FIELD_RISK.noticeDate).toBe('verified');
    // effective_date measured 87.5% — the one date that lost a label/value
    // association, so it is not presented as settled.
    expect(FIELD_RISK.effectiveDate).toBe('standard');
  });

  it('lets confidence demote a field but never promote one', () => {
    // A high-risk field with perfect confidence is still high risk: the failure
    // mode IS a confident wrong answer.
    expect(effectiveRisk('caseNumber', field('01-8313-2205', { confidence: 1 }))).toBe('high');
    // A verified field the cascade is unsure about drops a level.
    expect(effectiveRisk('deadlineDate', field('2026-09-05', { confidence: 0.4 }))).toBe('standard');
  });

  it('treats anything the user typed as settled', () => {
    expect(effectiveRisk('caseNumber', { value: '01-4472-9931', source: 'manual' })).toBe('verified');
  });

  it('promotes any field the cascade flagged as invalid', () => {
    expect(effectiveRisk('formId', field('SAR 7', { invalid: 'malformed' }))).toBe('high');
    expect(effectiveRisk('deadlineDate', field('1901-03-04', { invalid: 'implausible_date' }))).toBe('high');
  });
});

describe('which field Review opens focused on', () => {
  it('picks a high-risk field that has a value', () => {
    const fields: ExtractedNotice = {
      deadlineDate: field('2026-09-05'),
      caseNumber: field('01-4472-9931'),
    };
    expect(fieldNeedingAttention(fields)).toBe('caseNumber');
  });

  it('ignores a high-risk field that is empty', () => {
    // An empty field is visibly empty. The danger is a plausible wrong value
    // that gets confirmed without being read.
    const fields: ExtractedNotice = {
      deadlineDate: field('2026-09-05'),
      caseNumber: { source: 'regex' },
    };
    expect(fieldNeedingAttention(fields)).toBeUndefined();
  });

  it('puts a known-invalid value ahead of a merely high-risk one', () => {
    const fields: ExtractedNotice = {
      recipientName: field('ANN TRAN'),
      deadlineDate: field('1901-03-04', { invalid: 'implausible_date' }),
    };
    expect(fieldNeedingAttention(fields)).toBe('deadlineDate');
  });

  it('falls back to low confidence when nothing is high risk or invalid', () => {
    const fields: ExtractedNotice = {
      effectiveDate: field('2026-10-31', { confidence: 0.3 }),
    };
    expect(fieldNeedingAttention(fields)).toBe('effectiveDate');
  });

  it('has no opinion when everything looks fine', () => {
    expect(fieldNeedingAttention({ deadlineDate: field('2026-09-05') })).toBeUndefined();
  });
});
