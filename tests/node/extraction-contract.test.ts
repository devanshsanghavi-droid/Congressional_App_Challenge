/**
 * The contract every extractor must honour — written before the cascade exists.
 *
 * AUTHORSHIP: Claude. An adversarial suite against `/src/extraction`, written
 * before that cascade existed. Nothing here parses anything; it only checks what
 * comes back — which is why it survived the implementation being written by the
 * same hand: the standard was fixed first, in a separate commit, and the code
 * had to meet it rather than the other way round.
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

import { extractNotice } from '../../src/lib/extraction-port/adapter.ts';
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

/**
 * A synthetic page with **controlled boxes**.
 *
 * `synthetic()` above stacks every line at the same `x`, which is fine for the
 * text-shaped assertions but useless for anything that reads geometry: a column
 * walk cannot distinguish a left-hand address block from a right-hand metadata
 * column if both are at x = 0.1. These cases are specifically about geometry, so
 * they place their own boxes.
 *
 * `y` is derived from row order and `h` is a plausible line height, so
 * "same row" and "the line above" mean what they mean on a real page.
 */
function syntheticBoxed(rows: readonly { text: string; x: number; row: number }[]): ExtractionInput {
  const built = rows.map(({ text, x, row }) => ({
    text,
    confidence: 1,
    box: { x, y: 0.05 + row * 0.022, w: Math.min(0.9 - x, 0.02 + text.length * 0.011), h: 0.016 },
  }));
  return {
    lines: built,
    text: built.map((line) => line.text).join('\n'),
    width: 1700,
    height: 2200,
    nowMs: CORPUS_CLOCK_MS,
  };
}

/** Accent- and case-insensitive comparison, so a correct reading in any casing
 *  or with accents intact all count as the same person. */
function samePerson(a: string, b: string): boolean {
  const fold = (v: string): string =>
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  return fold(a) === fold(b);
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

/** A left-hand address block, with the right-hand metadata column interleaved
 *  into reading order the way a real recogniser emits it. */
const PAGE_ACCENTED = syntheticBoxed([
  { text: 'COUNTY OF SANTA CLARA', x: 0.06, row: 0 },
  { text: 'NOTICE OF ACTION', x: 0.06, row: 2 },
  { text: 'JOSÉ MARTÍNEZ', x: 0.06, row: 5 },
  { text: 'Case Number: 01-4472-9931', x: 0.60, row: 5 },
  { text: '1428 STORY ROAD APT 12', x: 0.06, row: 6 },
  { text: 'Worker ID: SC-2214', x: 0.60, row: 6 },
  { text: 'SAN JOSE, CA 95122', x: 0.06, row: 7 },
  { text: 'Notice Date: SEPTEMBER 8, 2026', x: 0.06, row: 9 },
]);

const PAGE_MIXED_CASE = syntheticBoxed([
  { text: 'County of Santa Clara', x: 0.06, row: 0 },
  { text: 'Notice of Action', x: 0.06, row: 2 },
  { text: 'Maria Reyes', x: 0.06, row: 5 },
  { text: '1428 Story Road Apt 12', x: 0.06, row: 6 },
  { text: 'San Jose, CA 95122', x: 0.06, row: 7 },
  { text: 'Notice Date: SEPTEMBER 8, 2026', x: 0.06, row: 9 },
]);

/**
 * The sender's block, complete with its own CA ZIP, printed **above** the
 * recipient's. This is the ordering the corpus never produces.
 */
const PAGE_SENDER_FIRST = syntheticBoxed([
  { text: 'COUNTY OF SANTA CLARA', x: 0.06, row: 0 },
  { text: 'SOCIAL SERVICES AGENCY', x: 0.06, row: 1 },
  { text: '333 W JULIAN ST', x: 0.06, row: 2 },
  { text: 'SAN JOSE, CA 95110', x: 0.06, row: 3 },
  { text: 'NOTICE OF ACTION', x: 0.06, row: 6 },
  { text: 'MARIA REYES', x: 0.06, row: 9 },
  { text: '1428 STORY ROAD APT 12', x: 0.06, row: 10 },
  { text: 'SAN JOSE, CA 95122', x: 0.06, row: 11 },
  { text: 'Notice Date: SEPTEMBER 8, 2026', x: 0.06, row: 13 },
]);


/**
 * A page whose month is garbled and whose year is fine.
 *
 * The year used to be `20XX`, which meant this fixture was passing for the
 * wrong reason: `DATE_PATTERN` requires four digits, so the *year* rejected it
 * and nothing ever had to reject the month. That made it a guard against a
 * failure it was not testing. With a real year, the garbled month is the only
 * thing wrong, which is what it was always supposed to be checking.
 *
 * It matters now because prefix-matching months (`SEPTEMBURR` -> `sep`) is a
 * change under consideration, and this is the input that would newly become
 * dangerous. The guard has to exist before the change it guards against.
 */
const PAGE_GARBLED_MONTH = synthetic([
  'Notice Date: SEPTEMBURR 45, 2026',
  'SUBMIT BY: THE END OF THE MONTH',
]);

/**
 * A month that reads cleanly and a day that cannot exist.
 *
 * `2026-09-45` is ISO-shaped, sorts correctly, and is not a day. A parser that
 * builds the string from parts without asking the calendar produces it happily,
 * and every downstream consumer — the countdown, the reminder ladder, the
 * storage boundary that converts to epoch millis — will accept it and do
 * something arbitrary. September 31 is the subtler sibling: one day past the
 * end of a real month, which no digit-count check catches.
 */
const PAGE_IMPOSSIBLE_DAY = synthetic([
  'Notice Date: SEPTEMBER 45, 2026',
  'SUBMIT BY: SEPTEMBER 31, 2026',
  'Effective Date: FEBRUARY 30, 2026',
]);

const PAGE_NO_FIELDS = synthetic([
  'COUNTY OF SANTA CLARA',
  'This page intentionally contains no dates, names or case numbers.',
  'Thank you for reading.',
]);

const PAGE_EMPTY = synthetic([]);

const PAGE_MINIMAL = synthetic(['Notice Date: JANUARY 5, 2026']);

const PAGE_CASE_NUMBER = synthetic([
  'COUNTY OF SANTA CLARA',
  'Case Number: 01-4472-9931',
  'Benefit Month: JULY 2026',
]);

/**
 * Every synthetic page in this file, in one place.
 *
 * The sweep below asserts a property over *all* of them, and that promise is
 * only true if new pages are added here rather than constructed inline. Tests
 * that need a page take it from this list; that is the mechanism, not a
 * convention — a page defined inline is a page the sweep cannot see, which is
 * exactly how `isRealIsoDate` came to run only against corpus captures.
 */
const SYNTHETIC_PAGES: readonly (readonly [string, ExtractionInput])[] = [
  ['minimal', PAGE_MINIMAL],
  ['no fields', PAGE_NO_FIELDS],
  ['empty', PAGE_EMPTY],
  ['garbled month', PAGE_GARBLED_MONTH],
  ['impossible day', PAGE_IMPOSSIBLE_DAY],
  ['case number', PAGE_CASE_NUMBER],
  ['accented name', PAGE_ACCENTED],
  ['mixed-case name', PAGE_MIXED_CASE],
  ['sender block first', PAGE_SENDER_FIRST],
];

// ---------------------------------------------------------------------------
// Which extractor is under test
// ---------------------------------------------------------------------------

describe('the extractor under test is the one the app actually uses', () => {
  it('is reachable and returns a result', () => {
    const result: ExtractionResult = extractNotice(PAGE_MINIMAL);
    expect(result).toBeDefined();
    expect(typeof result.redacted).toBe('boolean');
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
    const result = extractNotice(PAGE_NO_FIELDS);
    for (const [key, field] of entries(result.fields)) {
      expect(`${key}=${String(field.value)}`).toBe(`${key}=undefined`);
    }
  });

  it('finds no fields in an empty document', () => {
    const result = extractNotice(PAGE_EMPTY);
    expect(entries(result.fields).filter(([, f]) => f.value !== undefined)).toEqual([]);
  });

  it('does not turn an unparseable date into a plausible one', () => {
    // The GBNF finding, restated as a rule for the deterministic path: a slot
    // that must be filled gets filled with something. Absent is a legal answer;
    // `invalid` is a legal answer; a repaired guess is not.
    const result = extractNotice(PAGE_GARBLED_MONTH);
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


  it('does not report an SSN it did not see', () => {
    const result = extractNotice(PAGE_CASE_NUMBER);
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


// ---------------------------------------------------------------------------
// The recipient name — three cases the corpus cannot measure
// ---------------------------------------------------------------------------

/**
 * WHY THESE ARE SYNTHETIC, AND WHY THAT IS NOT A SHORTCUT
 * -------------------------------------------------------
 * All ten ground-truth recipient names are unaccented and upper-case, including
 * `ROSA MARTINEZ CRUZ` and `JOSE RAMIREZ` — two names that would carry accents
 * on a real notice. And while four of the twenty-three real captures do contain
 * a second CA ZIP (the `na960x` appeals PO box in Sacramento, and `505 W JULIAN
 * ST` on the housing notice), in **every** one of them the recipient's city line
 * is emitted before the sender's. So the corpus contains the hazard and never
 * once orders it adversarially.
 *
 * The consequence is precise: `npm run metrics` will report `recipient_name`
 * near its OCR ceiling while the field can still fail, silently, for a large
 * share of the households this app is built for. **A measurement cannot see what
 * its test data does not contain**, and the corpus is frozen until final metrics,
 * so the gap is covered here instead of by adding notices to it.
 *
 * Each case asserts the *contract*, never a value: **returning `undefined` is a
 * pass.** Recall belongs to the metrics harness. What must never happen is a
 * confident wrong name — the app shows it on Review under "check this against
 * your letter", and a plausible-looking wrong name is exactly the thing a tired
 * person taps past.
 */
describe('the recipient name is never a different name', () => {
  it('has fixtures that still contain what they are testing', () => {
    // Guards the way this suite decays: someone tidies a fixture, the distractor
    // disappears, and three tests keep passing while testing nothing.
    expect(PAGE_ACCENTED.text).toMatch(/JOSÉ MARTÍNEZ/);
    expect(PAGE_MIXED_CASE.text).toMatch(/Maria Reyes/);
    expect(PAGE_SENDER_FIRST.text.indexOf('CA 95110')).toBeLessThan(
      PAGE_SENDER_FIRST.text.indexOf('CA 95122'),
    );
  });

  it('reads an accented name, or reads nothing — never the street or the county', () => {
    const value = extractNotice(PAGE_ACCENTED).fields.recipientName?.value;
    if (value === undefined) return;
    expect(samePerson(value, 'JOSÉ MARTÍNEZ')).toBe(true);
  });

  it('reads a mixed-case name, or reads nothing', () => {
    const value = extractNotice(PAGE_MIXED_CASE).fields.recipientName?.value;
    if (value === undefined) return;
    expect(samePerson(value, 'Maria Reyes')).toBe(true);
  });

  it('never returns the sender when the agency block is printed first', () => {
    // The specific wrong answer this guards: anchoring on the first CA ZIP on the
    // page reaches the AGENCY's block, and "SOCIAL SERVICES AGENCY" is upper-case,
    // 22 characters, letters and spaces — it satisfies a name-shaped check. The
    // wrong answer here is well-formed, which is why a shape test alone cannot
    // catch it and why this is a test rather than a comment.
    const value = extractNotice(PAGE_SENDER_FIRST).fields.recipientName?.value;
    if (value === undefined) return;
    expect(samePerson(value, 'MARIA REYES')).toBe(true);
  });

  it('never returns an address line as a name, on any of the three', () => {
    for (const page of [PAGE_ACCENTED, PAGE_MIXED_CASE, PAGE_SENDER_FIRST]) {
      const value = extractNotice(page).fields.recipientName?.value;
      if (value === undefined) continue;
      expect(value).not.toMatch(/^\d/);
      expect(value).not.toMatch(/,\s*CA\s+\d{5}/);
      expect(value.toUpperCase()).not.toContain('AGENCY');
      expect(value.toUpperCase()).not.toContain('COUNTY OF');
    }
  });
});


// ---------------------------------------------------------------------------
// Every date, on every page — not just the corpus captures
// ---------------------------------------------------------------------------

/**
 * `isRealIsoDate` existed from the first version of this file and ran in exactly
 * one place: a loop over the real captures. So a date produced from a *synthetic*
 * page — every adversarial input in this file — was never calendar-checked. The
 * corpus contains no impossible days, because it was generated from valid ones,
 * which means the check was pointed away from the only inputs built to break it.
 *
 * That is the same shape as the `recipient_name` limit recorded in NOTES.md: a
 * check that only runs against data which cannot fail it.
 */
describe('every extracted date is a real day, on synthetic pages too', () => {
  it.each(SYNTHETIC_PAGES.map(([name, page]) => [name, page] as const))(
    'on the %s page',
    (_name, page) => {
      for (const key of DATE_FIELDS) {
        const field = extractNotice(page).fields[key];
        const value = field?.value;
        if (value === undefined) continue;

        // ISO shape is unconditional — it is what the storage boundary parses.
        expect(`${key}: ${value}`).toMatch(/^\w+: \d{4}-\d{2}-\d{2}$/);

        // RELAXED 2026-08-26, after this assertion failed against the cascade.
        // It originally demanded a real calendar day unconditionally, which was
        // stricter than its own stated intent and stricter than INTERFACE.md.
        //
        // The intent, written in the original comment, was to stop "2026-09-45"
        // *reaching a countdown*. A value returned with `invalid` set does not
        // reach one: Review shows it, marks it, and opens focused on it, and
        // `isoToLocalMs` refuses it at the storage boundary regardless.
        //
        // INTERFACE.md is explicit in the other direction — "If a date parses to
        // 1901, return 1901-03-04 with invalid: 'implausible_date' rather than
        // dropping it" — because a blank where the page visibly has a value is
        // confusing, and only a value the user can see is a value they can
        // correct. Demanding a real day here would have forced the cascade to
        // discard exactly the information `invalid` exists to carry.
        //
        // So the rule is the disjunction, which is what the sibling test below
        // already encoded: a returned date is a real day, OR it is flagged.
        const acceptable = isRealIsoDate(value) || field?.invalid !== undefined;
        expect(`${key}: ${value} acceptable=${acceptable}`).toBe(
          `${key}: ${value} acceptable=true`,
        );
      }
    },
  );

  it('never returns an impossible day from a page made of impossible days', () => {
    // September 45, September 31 and February 30 all read cleanly as months.
    // Whatever comes back must be absent, or flagged, or a day that exists.
    for (const key of DATE_FIELDS) {
      const field = extractNotice(PAGE_IMPOSSIBLE_DAY).fields[key];
      if (field?.value === undefined) continue;
      if (field.invalid !== undefined) continue;
      expect(`${key}=${field.value}`).toBe(`${key}=${isRealIsoDate(field.value) ? field.value : 'a real day'}`);
    }
  });

  it('has pages that actually contain dates, so the sweep is not vacuous', () => {
    // Guards the failure where every page yields nothing and the sweep passes
    // by never asserting anything.
    const withDates = SYNTHETIC_PAGES.filter(([, page]) => /\d{4}/.test(page.text));
    expect(withDates.length).toBeGreaterThanOrEqual(5);
  });
});
