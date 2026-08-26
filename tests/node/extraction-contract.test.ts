/**
 * The contract every extractor must honour — written before the cascade exists.
 *
 * AUTHORSHIP: Claude. Adversarial test suite against Devansh's `/src/extraction`
 * (CLAUDE.md §15 puts the cascade on his side of the line and the suites that
 * attack it on mine). Nothing here parses anything; it only checks what comes
 * back.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * It runs against whatever `adapter.ts` is currently wired to — the scaffold
 * today, the cascade the moment that import changes. No edit to this file is
 * needed to switch it over, which is the point: the standard is fixed *now*,
 * while nobody knows which way the implementation will lean.
 *
 * Almost every assertion is conditional in one specific way: **if you return a
 * value, it must satisfy this** — never "you must return a value". Requiring
 * recall here would duplicate `npm run metrics`, which measures recall properly
 * against ground truth, and would turn this file red for the entire time the
 * cascade is being written, which is exactly when it needs to be readable.
 * These are the invariants that make a *wrong* answer impossible, not the ones
 * that make a right answer likely.
 *
 * The distinction matters because of what the corpus measured: deterministic
 * extraction loses values (recall 87.6% on real OCR) and essentially never
 * invents them (zero wrong dates). A missing value costs the user a typing
 * prompt. A wrong value silently schedules the wrong day. This file guards the
 * second failure mode, hard, and leaves the first to the metrics harness.
 */

import { extractNotice, USING_SCAFFOLD } from '../../src/lib/extraction-port/adapter.ts';
import type {
  ExtractionInput,
  ExtractionResult,
  ExtractedField,
  ExtractedNotice,
} from '../../src/lib/extraction-port/port.ts';
import { FIELD_ORDER } from '../../src/lib/extraction-port/port.ts';
import { loadOcrCache, fullText } from '../../tools/metrics/ocr-cache.ts';
import type { OcrRecord } from '../../tools/metrics/ocr-cache.ts';
import { CORPUS_CLOCK_MS } from '../../tools/metrics/extractor.ts';
import { REAL_CAPTURES } from '../../tools/metrics/corpus.ts';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const cache = loadOcrCache();

function inputFor(record: OcrRecord): ExtractionInput {
  return {
    lines: record.lines,
    text: fullText(record),
    width: record.ocrWidth,
    height: record.ocrHeight,
    nowMs: CORPUS_CLOCK_MS,
  };
}

/** Every real photographed capture that has an OCR record. */
const realCaptures = REAL_CAPTURES.map((entry) => entry.file)
  .filter((file) => cache.records.has(file))
  .map((file) => ({ file, record: cache.records.get(file) as OcrRecord }));

/** A synthetic page, for the cases the corpus cannot produce on demand. */
function synthetic(lines: readonly string[]): ExtractionInput {
  const built = lines.map((text, index) => ({
    text,
    confidence: 1,
    box: { x: 0.1, y: 0.05 + index * 0.04, w: 0.5, h: 0.03 },
  }));
  return {
    lines: built,
    text: built.map((line) => line.text).join('\n'),
    width: 1700,
    height: 2200,
    nowMs: CORPUS_CLOCK_MS,
  };
}

const DATE_FIELDS = [
  'noticeDate',
  'deadlineDate',
  'effectiveDate',
  'appealDeadline',
  'aidPaidPendingDeadline',
] as const;

const ACTION_TYPES = [
  'approval', 'denial', 'reduction', 'discontinuance', 'info_request', 'recert_due',
];

const SOURCES = ['manual', 'regex', 'llm', 'llm_corrected'];
const INVALID_REASONS = ['implausible_date', 'out_of_range', 'malformed', 'failed_checksum'];

function entries(fields: ExtractedNotice): [string, ExtractedField][] {
  return FIELD_ORDER.flatMap((key) => {
    const field = fields[key];
    return field === undefined ? [] : [[key, field] as [string, ExtractedField]];
  });
}

/** ISO YYYY-MM-DD *and* a real day — "2026-02-31" is neither. */
function isRealIsoDate(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const [y, m, d] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// ---------------------------------------------------------------------------
// Which extractor is under test
// ---------------------------------------------------------------------------

describe('the extractor under test is the one the app actually uses', () => {
  it('is reachable and returns a result', () => {
    const result: ExtractionResult = extractNotice(synthetic(['Notice Date: JANUARY 5, 2026']));
    expect(result).toBeDefined();
    expect(typeof result.redacted).toBe('boolean');
  });

  it('reports honestly whether it is still the scaffold', () => {
    // USING_SCAFFOLD is a hand-maintained boolean, which makes it exactly the
    // kind of thing that goes stale silently — a comment asserting the opposite
    // of behaviour has already bitten this project twice. So check it against
    // the import rather than trusting it.
    const source = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'src/lib/extraction-port/adapter.ts'),
      'utf8',
    ) as string;
    const importsScaffold = /from '\.\/scaffold\.ts'/.test(source);
    expect(USING_SCAFFOLD).toBe(importsScaffold);
  });
});

// ---------------------------------------------------------------------------
// Shape — every value that comes back must be one the app can store
// ---------------------------------------------------------------------------

describe.each(realCaptures)('$file', ({ record }) => {
  const result = extractNotice(inputFor(record));
  const found = entries(result.fields);

  it('returns only dates in ISO YYYY-MM-DD, and only real calendar days', () => {
    // The app converts these to local-midnight epoch millis at the storage
    // boundary. A millisecond number, a US-format string, or 2026-02-31 all
    // move a deadline or throw somewhere far from here.
    for (const key of DATE_FIELDS) {
      const value = result.fields[key]?.value;
      if (value === undefined) continue;
      expect(typeof value).toBe('string');
      expect(isRealIsoDate(value)).toBe(true);
    }
  });

  it('labels every field with a source the app knows', () => {
    for (const [, field] of found) expect(SOURCES).toContain(field.source);
  });

  it('keeps confidence inside 0–1 when it reports one', () => {
    for (const [, field] of found) {
      if (field.confidence === undefined) continue;
      expect(field.confidence).toBeGreaterThanOrEqual(0);
      expect(field.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('points sourceLineIndexes at lines that exist', () => {
    // Review draws the union of these boxes on the photo. An index past the end
    // of the array is a crash on the screen whose whole job is letting the user
    // check the value.
    for (const [, field] of found) {
      for (const index of field.sourceLineIndexes ?? []) {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(record.lines.length);
      }
    }
  });

  it('never marks a field invalid without showing what is invalid', () => {
    // `invalid` exists so Review can display a wrong value and focus it. An
    // invalid flag with no value gives the user nothing to correct and outranks
    // every other field for the cursor — the worst of both.
    for (const [, field] of found) {
      if (field.invalid === undefined) continue;
      expect(INVALID_REASONS).toContain(field.invalid);
      expect(field.value).toBeDefined();
    }
  });

  it('returns an actionType the app can store, or none', () => {
    const value = result.fields.actionType?.value;
    if (value !== undefined) expect(ACTION_TYPES).toContain(value);
  });

  it('never returns an empty string where it means "not found"', () => {
    // saveNotice cannot tell '' from a value, and Review would render a field
    // that looks filled in and is not.
    for (const [, field] of found) {
      if (field.value === undefined) continue;
      expect(field.value.trim()).not.toBe('');
    }
  });

  it('returns requiredDocs without duplicates', () => {
    const docs = result.requiredDocs ?? [];
    expect(new Set(docs).size).toBe(docs.length);
  });
});

// ---------------------------------------------------------------------------
// Purity — the harness and the app must get the same answer
// ---------------------------------------------------------------------------

describe('the extractor is pure', () => {
  const sample = realCaptures[0];

  it('returns the same result for the same input, twice', () => {
    if (!sample) return;
    const once = extractNotice(inputFor(sample.record));
    const twice = extractNotice(inputFor(sample.record));
    expect(twice).toEqual(once);
  });

  it('does not mutate the input it was handed', () => {
    if (!sample) return;
    const input = inputFor(sample.record);
    const before = JSON.stringify(input);
    extractNotice(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('reads no clock of its own', () => {
    // Every date on the page is a fact about the page. If moving nowMs by a
    // year changes a single extracted field, something is resolving a relative
    // expression against the wall clock, and the corpus score stops being
    // reproducible the day after it is measured.
    if (!sample) return;
    const now = extractNotice(inputFor(sample.record));
    const later = extractNotice({
      ...inputFor(sample.record),
      nowMs: CORPUS_CLOCK_MS + 365 * 24 * 60 * 60 * 1000,
    });
    expect(later.fields).toEqual(now.fields);
  });
});

// ---------------------------------------------------------------------------
// Invention — the failure mode that matters
// ---------------------------------------------------------------------------

describe('nothing is invented', () => {
  it('finds no fields on a page with no fields', () => {
    const result = extractNotice(
      synthetic([
        'COUNTY OF SANTA CLARA',
        'This page intentionally contains no dates, names or case numbers.',
        'Thank you for reading.',
      ]),
    );
    for (const [key, field] of entries(result.fields)) {
      expect(`${key}=${String(field.value)}`).toBe(`${key}=undefined`);
    }
  });

  it('finds no fields in an empty document', () => {
    const result = extractNotice(synthetic([]));
    expect(entries(result.fields).filter(([, f]) => f.value !== undefined)).toEqual([]);
  });

  it('does not turn an unparseable date into a plausible one', () => {
    // The GBNF finding, restated as a rule for the deterministic path: a slot
    // that must be filled gets filled with something. Absent is a legal answer;
    // `invalid` is a legal answer; a repaired guess is not.
    const result = extractNotice(
      synthetic(['Notice Date: SEPTEMBURR 45, 20XX', 'SUBMIT BY: THE END OF THE MONTH']),
    );
    for (const key of DATE_FIELDS) {
      const field = result.fields[key];
      if (field?.value === undefined) continue;
      // If it returned something for these, it must be flagged — there is no
      // reading of this page that yields a confident date.
      expect(field.invalid).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// The two appeal clocks
// ---------------------------------------------------------------------------

describe('the appeal clocks stay separate', () => {
  it('never reports the same date for both', () => {
    // 10 days to keep benefits flowing during the appeal; 90 days to request
    // the hearing at all. Two different questions. A single number answers
    // neither, and the realistic failure is drift, not a changed constant.
    for (const { record } of realCaptures) {
      const fields = extractNotice(inputFor(record)).fields;
      const aidPaid = fields.aidPaidPendingDeadline?.value;
      const appeal = fields.appealDeadline?.value;
      if (aidPaid === undefined || appeal === undefined) continue;
      expect(aidPaid).not.toBe(appeal);
    }
  });

  it('puts aid-paid-pending on or before the hearing deadline', () => {
    for (const { record } of realCaptures) {
      const fields = extractNotice(inputFor(record)).fields;
      const aidPaid = fields.aidPaidPendingDeadline?.value;
      const appeal = fields.appealDeadline?.value;
      if (aidPaid === undefined || appeal === undefined) continue;
      expect(aidPaid <= appeal).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Redaction — the claim the whole app is built on
// ---------------------------------------------------------------------------

describe('redaction is claimed only when it happened', () => {
  // The eight printed forms an SSN takes across the corpus and real county mail.
  const SSN_FORMS = [
    '123-45-6789',
    '123 45 6789',
    '123456789',
    'SSN: 123-45-6789',
    'Social Security Number: 123-45-6789',
    'SSN 123‑45‑6789', // non-breaking hyphen, as OCR sometimes returns it
    'XXX-XX-6789',
    'Numero de Seguro Social: 123-45-6789',
  ];

  it.each(SSN_FORMS)('does not claim a clean read of %s without saying it found one', (form) => {
    const result = extractNotice(
      synthetic(['COUNTY OF SANTA CLARA', 'MARIA REYES', form, 'SUBMIT BY: SEPTEMBER 5, 2026']),
    );
    // The contract: `redacted: true` is a statement that the redaction matcher
    // ran over this text. If it ran and this text contains an SSN, then
    // containedSsn is how the app knows to tell the user. Claiming the first
    // while missing the second means the flag is decorative.
    //
    // saveNotice() throws on `redacted: false`, so this flag is the only thing
    // standing between OCR text and the database. It has already been wrong
    // once — see NOTES.md, 2026-08-26.
    if (result.redacted) expect(result.containedSsn).toBe(true);
  });

  it('never reports removing an SSN without also claiming redaction', () => {
    // containedSsn means "the matcher found one and took it out". There is no
    // way to know that without having run, so the two flags cannot disagree in
    // this direction.
    const result = extractNotice(
      synthetic(['MARIA REYES', 'SSN: 123-45-6789', 'SUBMIT BY: SEPTEMBER 5, 2026']),
    );
    if (result.containedSsn === true) expect(result.redacted).toBe(true);
  });

  it('is never claimed by the scaffold, which has no matcher', () => {
    // Dies naturally when the cascade lands — at which point the assertions
    // above take over. Until then this is the specific regression guard for
    // the specific thing that went wrong: `redacted: true` sat in scaffold.ts
    // from fc33506 to 2026-08-26, disarming saveNotice()'s refusal to store
    // unredacted OCR text. Nothing threw, nothing logged, and INTERFACE.md
    // documented the opposite of what the code did.
    if (!USING_SCAFFOLD) return;
    const result = extractNotice(
      synthetic(['MARIA REYES', 'SSN: 123-45-6789', 'SUBMIT BY: SEPTEMBER 5, 2026']),
    );
    expect(result.redacted).toBe(false);
  });

  it('does not report an SSN it did not see', () => {
    const result = extractNotice(
      synthetic(['COUNTY OF SANTA CLARA', 'Case Number: 01-4472-9931', 'Benefit Month: JULY 2026']),
    );
    if (result.containedSsn !== undefined) expect(result.containedSsn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Good news must not look like bad news
// ---------------------------------------------------------------------------

describe('an approval', () => {
  /**
   * Notice 10 is the corpus's approval trap — "if the app shows a red countdown
   * on good news, the logic is wrong". It is the one notice that was never
   * photographed, deliberately: what it tests is scheduling logic rather than
   * OCR, and `tools/metrics/logic.ts` asserts the scheduling half against
   * ground truth.
   *
   * What is left for this file is the extractor's half, so the page is rebuilt
   * synthetically from notice 10's own ground-truth values. It is not a
   * substitute for a capture and is not scored; it exists so that "reads an
   * approval as a termination" fails here rather than in a demo.
   */
  const approval = synthetic([
    'COUNTY OF SANTA CLARA',
    'DEPARTMENT OF SOCIAL SERVICES',
    'NOTICE OF ACTION - APPROVAL',
    'NA 960 SAR (Rev. 10/24)',
    'SAMUEL BRIGHT',
    '882 LOS OLIVOS DRIVE',
    'SANTA CLARA, CA 95050',
    'Case Number: 01-2204-6653',
    'Notice Date: AUGUST 12, 2026',
    'Your CalFresh application is approved.',
    'Benefits start: AUGUST 15, 2026',
    'Monthly benefit: $412.00',
    'Your certification period ends FEBRUARY 28, 2027.',
    'If you disagree you may ask for a hearing within 90 days.',
  ]);

  it('is not read as an action against the recipient', () => {
    const action = extractNotice(approval).fields.actionType?.value;
    if (action === undefined) return;
    expect(['discontinuance', 'denial', 'reduction']).not.toContain(action);
  });

  it('produces no deadline for the user to miss', () => {
    // There is nothing to return on this page. An approval with a deadlineDate
    // becomes a red countdown on Home and an escalating reminder ladder for a
    // person whose benefits were just granted.
    expect(extractNotice(approval).fields.deadlineDate?.value).toBeUndefined();
  });
});
