/**
 * The contract between the app and the extraction cascade.
 *
 * ---------------------------------------------------------------------------
 * AUTHORSHIP. `/src/extraction` is Devansh's (CLAUDE.md §15) — the schema, the
 * GBNF grammar, the prompt construction, the redaction matcher, region
 * selection, the pre-fill heuristics, the sanity pass and the confidence model.
 *
 * This file is the *app side* of that boundary: what the Capture and Review
 * screens need in order to exist before the cascade does. It declares a shape
 * and nothing else — no parsing, no patterns, no heuristics. If the cascade's
 * own types end up different, adapt them in `adapter.ts`; do not bend the
 * island to fit this file.
 * ---------------------------------------------------------------------------
 */

import type { OcrLine } from '../ocr/types.ts';

/** Everything the cascade gets. No globals, no I/O — same as the harness. */
export interface ExtractionInput {
  readonly lines: readonly OcrLine[];
  readonly text: string;
  /** Pixel dimensions the normalised boxes refer to. */
  readonly width: number;
  readonly height: number;
  /** The clock, passed in rather than read, so results are reproducible. */
  readonly nowMs: number;
  readonly languageHint?: string;
}

/**
 * Which layer produced a value. Drives what Review shows: a value the user
 * typed is not re-flagged, and an LLM value is marked as machine-generated
 * (CLAUDE.md §4 guardrail 2).
 */
export type ExtractionSource = 'manual' | 'regex' | 'llm' | 'llm_corrected';

/**
 * How likely this field is to be **wrong in a way the user will not notice**.
 *
 * Deliberately not a number, and deliberately not derived from one.
 *
 * The corpus measurement (2026-08-20, 23 real captures) is that deterministic
 * extraction holds **100% precision on every date it schedules on** and drops
 * to 90.5% / 91.3% on `recipient_name` / `case_number` — and those failures are
 * OCR character misreads, so they arrive looking perfectly plausible.
 * `01-8313-2205` is a well-formed case number. It is simply the wrong one.
 *
 * A single confidence score would average those two populations into a number
 * that describes neither. So risk is a property of the *field*, set from
 * measurement, and a confidence score (when the cascade produces one) can only
 * make a field look worse, never better.
 */
export type FieldRisk =
  /** Measured near-perfect. Review shows it as already confirmed. */
  | 'verified'
  /** Ordinary. Shown plainly, editable. */
  | 'standard'
  /** Fails silently and plausibly. Review pushes the user to check it. */
  | 'high';

export interface ExtractedField {
  /** The value, or undefined when the cascade found nothing. Never invented. */
  readonly value?: string;
  readonly source: ExtractionSource;
  /**
   * The cascade's own confidence, 0–1, if it has one. Optional: the app must
   * work without it, and it can only lower a field's standing, never raise it.
   */
  readonly confidence?: number;
  /**
   * Which OCR lines this came from, so Review can highlight the spot on the
   * photo. The single most useful thing for checking a misread case number.
   *
   * **Every** contributing line, in reading order — Review draws the union of
   * their boxes. Include the label line as well as the value line when they are
   * separate: highlighting a bare date in the middle of the page does not help
   * anyone check it.
   */
  readonly sourceLineIndexes?: readonly number[];

  /**
   * Set when a value was found but failed a validity check.
   *
   * Present-and-wrong is a different situation from absent, and the app treats
   * it differently: a blank field where the page clearly has a value is
   * confusing, whereas a wrong value the user can see is fixable in one tap. So
   * the cascade returns what it found and says it is suspect, rather than
   * dropping it or silently repairing it.
   *
   * Only what can be judged from the value alone — an implausible year, a case
   * number of the wrong length, a month of 20. Cross-field contradictions are
   * the sanity pass's business, though it may report them here too.
   */
  readonly invalid?: 'implausible_date' | 'out_of_range' | 'malformed' | 'failed_checksum';
}

/**
 * The fields the app knows how to store and schedule from.
 *
 * Every one is optional. CLAUDE.md §4: if the cascade cannot find a value the
 * field is empty and the user fills it in — never fabricated.
 */
export interface ExtractedNotice {
  readonly recipientName?: ExtractedField;
  readonly caseNumber?: ExtractedField;
  readonly programId?: ExtractedField;
  readonly agency?: ExtractedField;
  readonly formId?: ExtractedField;
  /** One of the ActionType values; the app treats an unknown value as absent. */
  readonly actionType?: ExtractedField;
  /** ISO YYYY-MM-DD. The app converts to local-midnight epoch millis. */
  readonly noticeDate?: ExtractedField;
  readonly deadlineDate?: ExtractedField;
  readonly effectiveDate?: ExtractedField;
  readonly appealDeadline?: ExtractedField;
  readonly aidPaidPendingDeadline?: ExtractedField;
}

export interface ExtractionResult {
  readonly fields: ExtractedNotice;
  /** Document-type ids for the checklist, if the cascade produces them. */
  readonly requiredDocs?: readonly string[];
  /**
   * True once the redaction matcher has run over the text. The storage layer
   * refuses to persist OCR text without it — see `src/lib/db/notices.ts`.
   */
  readonly redacted: boolean;
  /** Set when an SSN was found and removed, so the UI can say so. */
  readonly containedSsn?: boolean;
}

export type Extractor = (input: ExtractionInput) => ExtractionResult;

/** Field keys in the order Review lays them out. */
export const FIELD_ORDER = [
  'deadlineDate',
  'recipientName',
  'caseNumber',
  'programId',
  'actionType',
  'noticeDate',
  'effectiveDate',
  'aidPaidPendingDeadline',
  'appealDeadline',
  'formId',
  'agency',
] as const satisfies readonly (keyof ExtractedNotice)[];

export type FieldKey = (typeof FIELD_ORDER)[number];

/**
 * Risk per field, from the 2026-08-20 corpus run. Precision on real captures:
 *
 *   dates and action_type ....... 100%   -> verified
 *   case_number ................. 91.3%  -> high  (misread digits look valid)
 *   recipient_name .............. 90.5%  -> high  (ANH TRAN -> "ANN TRAN")
 *   everything else ............. n/a    -> standard
 *
 * `effectiveDate` is `standard` rather than `verified`: it measured 87.5%, the
 * one date field that lost a label/value association on a hard capture.
 */
export const FIELD_RISK: Readonly<Record<FieldKey, FieldRisk>> = {
  deadlineDate: 'verified',
  recipientName: 'high',
  caseNumber: 'high',
  programId: 'verified',
  actionType: 'verified',
  noticeDate: 'verified',
  effectiveDate: 'standard',
  aidPaidPendingDeadline: 'verified',
  appealDeadline: 'verified',
  formId: 'standard',
  agency: 'standard',
};

/**
 * The field Review should open focused on: the highest-risk one that actually
 * has a value to check. A high-risk field the cascade left empty is not urgent
 * — an empty field is visibly empty. A high-risk field with a plausible wrong
 * value is the one that gets confirmed without being read.
 */
export function fieldNeedingAttention(fields: ExtractedNotice): FieldKey | undefined {
  const withValue = FIELD_ORDER.filter((key) => fields[key]?.value);
  return (
    // A value already known to be wrong outranks one that is merely likely to
    // be. Then the measured high-risk fields, then anything the cascade itself
    // flagged as low confidence.
    withValue.find((key) => fields[key]?.invalid !== undefined) ??
    withValue.find((key) => FIELD_RISK[key] === 'high') ??
    withValue.find((key) => (fields[key]?.confidence ?? 1) < 0.7)
  );
}

/**
 * A field's standing as Review should present it. Confidence can demote a
 * field but never promote one, because the measured risk is about failures the
 * cascade cannot see — a misread character produces a confident wrong answer.
 */
export function effectiveRisk(key: FieldKey, field: ExtractedField | undefined): FieldRisk {
  const base = FIELD_RISK[key];
  if (field?.value === undefined) return base;
  // A field the cascade itself flagged is high risk whatever the measurement
  // says about that field in general.
  if (field.invalid !== undefined) return 'high';
  if (field.source === 'manual') return 'verified';
  if ((field.confidence ?? 1) < 0.7 && base === 'verified') return 'standard';
  return base;
}
