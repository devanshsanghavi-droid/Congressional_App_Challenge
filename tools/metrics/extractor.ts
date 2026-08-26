/**
 * Carta metrics harness — the seam where the extraction cascade plugs in.
 *
 * AUTHORSHIP: Claude, and this boundary is drawn deliberately.
 *
 * CLAUDE.md §15: /src/extraction is the student's work — the schema, the GBNF
 * grammar, the prompt construction, the redaction matcher, the region
 * selection, the pre-fill heuristics, the sanity pass and the confidence model.
 * None of that is in this file and none of it should be. What is here is the
 * adapter the harness needs in order to *call* that work and score it:
 *
 *   - the shape of the input the harness can supply (OCR lines, boxes, a
 *     clock — exactly the arguments the island README says arrive as
 *     arguments);
 *   - the shape of the result the scorer can read;
 *   - a loader that pulls an extractor out of a module at a path.
 *
 * When the cascade exists, point the harness at it:
 *
 *     npm run metrics -- --extractor src/extraction/index.ts
 *
 * and it is scored on every field, every condition, both buckets. Until then
 * the default is the null extractor below, which produces nothing — so the
 * table reports the honest floor and, more usefully, the OCR ceiling beside it,
 * which is the number that says how much is *available* to be extracted.
 *
 * If the island's own API ends up shaped differently, adapt it here. That is
 * what this file is for; do not bend the island to fit the harness.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import type { OcrLine } from './ocr-cache.ts';

/** Everything the harness can hand an extractor. No globals, no I/O. */
export interface ExtractionInput {
  /** Recognised lines in reading order, with normalised top-left boxes. */
  readonly lines: readonly OcrLine[];
  /** The same text as one blob, for whole-page regex work. */
  readonly text: string;
  /** Page dimensions the boxes are normalised against. */
  readonly width: number;
  readonly height: number;
  /**
   * The clock, passed in rather than read. Fixed by the harness so that a
   * relative date ("within 10 days") resolves identically on every run —
   * a corpus score that changed with the wall clock would be worthless.
   */
  readonly nowMs: number;
  /** BCP-47-ish hint if the caller knows it. Extraction may ignore it. */
  readonly languageHint?: string;
}

/**
 * A field the extractor produced. `confidence` is optional here because the
 * harness does not need it to score precision and recall — but it is the thing
 * the Review screen shows, so it is carried through if present.
 */
export interface ExtractedField {
  readonly value: string | number;
  readonly confidence?: number;
  /** Which layer produced it, if the cascade tracks that. */
  readonly source?: string;
}

export interface ExtractionResult {
  /** Scalar fields, keyed by the names in ground_truth.json. */
  readonly fields: Readonly<Record<string, ExtractedField | undefined>>;
  /** Document-type ids for `required_docs`, if the cascade produces them. */
  readonly requiredDocs?: readonly string[];
}

export type ExtractorFn = (input: ExtractionInput) => ExtractionResult;

export interface Extractor {
  readonly id: string;
  readonly run: ExtractorFn;
}

/**
 * The floor. Produces nothing, so precision is undefined and recall is zero.
 *
 * This is not a placeholder to be filled in — it is a real baseline. Every
 * number the cascade eventually posts is only meaningful as a distance from
 * here, and having it in the table from the start makes that distance visible.
 */
export const nullExtractor: Extractor = {
  id: 'null',
  run: () => ({ fields: {} }),
};

/**
 * Load an extractor from a module path. The module must export either a
 * function named `extract`, or a default export that is one.
 */
export async function loadExtractor(modulePath: string): Promise<Extractor> {
  const absolute = resolve(process.cwd(), modulePath);
  const module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  const candidate = module['extract'] ?? module['default'];
  if (typeof candidate !== 'function') {
    throw new Error(
      `${modulePath} exports no \`extract\` function. The harness expects ` +
        '`export function extract(input: ExtractionInput): ExtractionResult`, ' +
        'or an adapter in tools/metrics/extractor.ts that reshapes whatever it does export.',
    );
  }
  return { id: modulePath, run: reshape(candidate as (input: ExtractionInput) => unknown) };
}

/**
 * Field names as `/src/extraction` emits them, mapped to the names
 * `ground_truth.json` uses.
 *
 * The island speaks the app's vocabulary — camelCase, because that is what
 * `port.ts` and every screen use — and the corpus speaks the corpus's. Neither
 * should bend to the other: the island must not carry snake_case keys it never
 * uses on the phone, and the ground truth must not be renamed to suit an
 * extractor, or every number measured before today stops being comparable.
 *
 * So the translation lives here, in the seam, which is what
 * `src/extraction/INTERFACE.md` says the seam is for.
 */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  recipientName: 'recipient_name',
  caseNumber: 'case_number',
  programId: 'program',
  agency: 'agency',
  formId: 'form_id',
  actionType: 'action_type',
  noticeDate: 'notice_date',
  deadlineDate: 'deadline_date',
  effectiveDate: 'effective_date',
  appealDeadline: 'appeal_deadline',
  aidPaidPendingDeadline: 'aid_paid_pending_deadline',
};

/**
 * Accept either vocabulary.
 *
 * A key that is already snake_case passes through untouched, so the probes in
 * `tools/metrics/probe/` — which emit corpus names directly — keep working and
 * stay comparable to the cascade. A field carrying `invalid` is dropped: the
 * harness scores what an extractor *claims*, and a value the extractor has
 * already marked as wrong is not a claim.
 */
function reshape(run: (input: ExtractionInput) => unknown): ExtractorFn {
  return (input) => {
    const raw = run(input) as {
      fields?: Record<string, { value?: unknown; invalid?: string; source?: string; confidence?: number } | undefined>;
      requiredDocs?: readonly string[];
    };
    const fields: Record<string, ExtractedField | undefined> = {};
    for (const [key, field] of Object.entries(raw.fields ?? {})) {
      if (!field || field.value === undefined || field.value === '') continue;
      if (field.invalid !== undefined) continue;
      const name = FIELD_NAMES[key] ?? key;
      fields[name] = {
        value: field.value as string | number,
        ...(field.source === undefined ? {} : { source: field.source }),
        ...(field.confidence === undefined ? {} : { confidence: field.confidence }),
      };
    }
    return raw.requiredDocs === undefined
      ? { fields }
      : { fields, requiredDocs: raw.requiredDocs };
  };
}

/**
 * The clock the corpus is scored against: 2026-09-01T09:00 local.
 *
 * Chosen to sit inside the corpus's date range so relative reasoning has
 * somewhere to stand — notice 01's deadline is four days out from here, notice
 * 02 has already issued, notice 04 has not. Fixed, because a corpus score that
 * drifts with the date it was run is not a measurement.
 */
export const CORPUS_CLOCK_MS = new Date(2026, 8, 1, 9, 0, 0, 0).getTime();
