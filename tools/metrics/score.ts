/**
 * Carta metrics harness — the scoring math.
 *
 * AUTHORSHIP: Claude. Harness infrastructure. Formatting lives in report.ts;
 * this file only counts.
 *
 * Three things are measured per image, and keeping them apart is the whole
 * point of the exercise:
 *
 *   OCR CEILING   Is the value even in the recognised text? Only defined for
 *                 fields that are literally printed. This is the most the
 *                 extraction cascade could possibly get right, and it is what
 *                 lets a missing field be attributed: below the ceiling is an
 *                 extraction problem, at the ceiling is an OCR problem.
 *
 *   PRECISION     Of the values the cascade produced, how many were right.
 *                 A wrong deadline is worse than a blank one — a blank field
 *                 is one the user fills in on the Review screen, a wrong one is
 *                 a reminder on the wrong morning that the user has no reason
 *                 to doubt. Precision is the number that tracks that harm.
 *
 *   RECALL        Of the values that were there, how many the cascade produced.
 *                 This is the one that measures how much typing the user is
 *                 saved.
 *
 * A wrong value counts as both a false positive and a false negative. That is
 * the standard convention for extraction and it is the conservative one: it
 * penalises a confident wrong answer twice, which matches how much worse it is
 * here.
 */

import type { CaptureEntry, Corpus, NoticeTruth } from './corpus.ts';
import { CRITICAL_FIELDS, specFor, squash, surfaceForms, valuesMatch } from './fields.ts';
import type { Extractor, ExtractionInput } from './extractor.ts';
import { CORPUS_CLOCK_MS } from './extractor.ts';
import type { OcrCache, OcrRecord } from './ocr-cache.ts';
import { fullText } from './ocr-cache.ts';

export interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

export interface CeilingCounts {
  /** Images where at least one surface form of the truth value was found. */
  hits: number;
  /** Images where the field was in the ground truth at all. */
  support: number;
}

export function emptyCounts(): Counts {
  return { tp: 0, fp: 0, fn: 0 };
}

export function add(into: Counts, from: Counts): void {
  into.tp += from.tp;
  into.fp += from.fp;
  into.fn += from.fn;
}

/** Undefined rather than 0 when nothing was produced — "no data" is not "0%". */
export function precision(c: Counts): number | undefined {
  const denominator = c.tp + c.fp;
  return denominator === 0 ? undefined : c.tp / denominator;
}

export function recall(c: Counts): number | undefined {
  const denominator = c.tp + c.fn;
  return denominator === 0 ? undefined : c.tp / denominator;
}

export function f1(c: Counts): number | undefined {
  const p = precision(c);
  const r = recall(c);
  if (p === undefined || r === undefined || p + r === 0) return undefined;
  return (2 * p * r) / (p + r);
}

// ------------------------------------------------------------- per image

export interface ImageScore {
  readonly capture: CaptureEntry;
  readonly ocrLines: number;
  /** Per field, for fields present in this notice's ground truth. */
  readonly perField: ReadonlyMap<string, Counts>;
  /** Per printed field: was the value findable in the text at all. */
  readonly ceiling: ReadonlyMap<string, boolean>;
  /** Fields the extractor produced that the notice does not have. */
  readonly spurious: readonly string[];
}

/**
 * Ground truth carries notice-level attributes (form_id, action_type, …)
 * alongside the per-notice `fields` map. The cascade has to produce both, so
 * scoring flattens them into one namespace.
 */
export function truthFields(notice: NoticeTruth): Map<string, string | readonly string[]> {
  const flat = new Map<string, string | readonly string[]>([
    ['form_id', notice.form_id],
    ['program', notice.program],
    ['agency', notice.agency],
    ['language', notice.language],
    ['action_type', notice.action_type],
  ]);
  for (const [key, value] of Object.entries(notice.fields)) flat.set(key, value);
  return flat;
}

function ceilingHit(field: string, truth: string, pageText: string): boolean {
  const haystack = squash(pageText);
  return surfaceForms(field, truth).some((form) => haystack.includes(squash(form)));
}

export function scoreImage(
  capture: CaptureEntry,
  notice: NoticeTruth,
  record: OcrRecord,
  extractor: Extractor,
): ImageScore {
  const text = fullText(record);
  const input: ExtractionInput = {
    lines: record.lines,
    text,
    width: record.ocrWidth,
    height: record.ocrHeight,
    nowMs: CORPUS_CLOCK_MS,
    ...(notice.language === 'en+es' ? {} : { languageHint: notice.language }),
  };
  const result = extractor.run(input);

  const truth = truthFields(notice);
  const perField = new Map<string, Counts>();
  const ceiling = new Map<string, boolean>();

  for (const [field, want] of truth) {
    const spec = specFor(field);
    const counts = emptyCounts();

    if (spec.kind === 'doclist') {
      // Scored per item so a list that is half right scores half, not zero.
      const wanted = new Set((want as readonly string[]).map((d) => d.toLowerCase()));
      const got = new Set((result.requiredDocs ?? []).map((d) => d.toLowerCase()));
      for (const doc of wanted) {
        if (got.has(doc)) counts.tp += 1;
        else counts.fn += 1;
      }
      for (const doc of got) if (!wanted.has(doc)) counts.fp += 1;
    } else {
      const wantValue = want as string;
      const got = result.fields[field];
      if (got === undefined || got.value === '' ) {
        counts.fn++;
      } else if (valuesMatch(field, wantValue, got.value)) {
        counts.tp++;
      } else {
        // Wrong, not absent. Both a false positive and a false negative.
        counts.fp++;
        counts.fn++;
      }
      if (spec.evidence === 'printed') {
        ceiling.set(field, ceilingHit(field, wantValue, text));
      }
    }
    perField.set(field, counts);
  }

  // A value produced for a field this notice does not have is a false positive
  // with no truth to compare against — the cascade inventing a deadline that is
  // not on the page is precisely what CLAUDE.md §4 forbids, so it is counted.
  const spurious: string[] = [];
  for (const [field, value] of Object.entries(result.fields)) {
    if (value === undefined || truth.has(field)) continue;
    spurious.push(field);
    const counts = perField.get(field) ?? emptyCounts();
    counts.fp++;
    perField.set(field, counts);
  }

  return { capture, ocrLines: record.lines.length, perField, ceiling, spurious };
}

// ------------------------------------------------------------- aggregation

export interface Cell {
  readonly counts: Counts;
  readonly ceiling: CeilingCounts;
  /** Images that contributed to this cell. */
  readonly images: number;
}

export interface Aggregate {
  /** field -> condition -> cell */
  readonly byFieldCondition: ReadonlyMap<string, ReadonlyMap<string, Cell>>;
  /** field -> cell, across every condition in the bucket */
  readonly byField: ReadonlyMap<string, Cell>;
  /** condition -> cell, across every field */
  readonly byCondition: ReadonlyMap<string, Cell>;
  /** condition -> cell, restricted to the scheduling-critical fields */
  readonly byConditionCritical: ReadonlyMap<string, Cell>;
  readonly conditions: readonly string[];
  readonly fields: readonly string[];
  readonly imageCount: number;
}

function blankCell(): { counts: Counts; ceiling: CeilingCounts; images: number } {
  return { counts: emptyCounts(), ceiling: { hits: 0, support: 0 }, images: 0 };
}

function bump(
  map: Map<string, { counts: Counts; ceiling: CeilingCounts; images: number }>,
  key: string,
): { counts: Counts; ceiling: CeilingCounts; images: number } {
  let cell = map.get(key);
  if (!cell) {
    cell = blankCell();
    map.set(key, cell);
  }
  return cell;
}

export function aggregate(scores: readonly ImageScore[]): Aggregate {
  const byFieldCondition = new Map<
    string,
    Map<string, { counts: Counts; ceiling: CeilingCounts; images: number }>
  >();
  const byField = new Map<string, { counts: Counts; ceiling: CeilingCounts; images: number }>();
  const byCondition = new Map<string, { counts: Counts; ceiling: CeilingCounts; images: number }>();
  const byConditionCritical = new Map<
    string,
    { counts: Counts; ceiling: CeilingCounts; images: number }
  >();
  const conditions = new Set<string>();
  const fields = new Set<string>();

  for (const score of scores) {
    const condition = score.capture.condition;
    conditions.add(condition);

    for (const [field, counts] of score.perField) {
      fields.add(field);
      const hit = score.ceiling.get(field);

      let perCondition = byFieldCondition.get(field);
      if (!perCondition) {
        perCondition = new Map();
        byFieldCondition.set(field, perCondition);
      }
      for (const cell of [bump(perCondition, condition), bump(byField, field)]) {
        add(cell.counts, counts);
        cell.images += 1;
        if (hit !== undefined) {
          cell.ceiling.support += 1;
          if (hit) cell.ceiling.hits += 1;
        }
      }

      const conditionCell = bump(byCondition, condition);
      add(conditionCell.counts, counts);
      if (hit !== undefined) {
        conditionCell.ceiling.support += 1;
        if (hit) conditionCell.ceiling.hits += 1;
      }

      if (CRITICAL_FIELDS.includes(field)) {
        const criticalCell = bump(byConditionCritical, condition);
        add(criticalCell.counts, counts);
        if (hit !== undefined) {
          criticalCell.ceiling.support += 1;
          if (hit) criticalCell.ceiling.hits += 1;
        }
      }
    }

    bump(byCondition, condition).images += 1;
    bump(byConditionCritical, condition).images += 1;
  }

  return {
    byFieldCondition,
    byField,
    byCondition,
    byConditionCritical,
    conditions: [...conditions],
    fields: [...fields],
    imageCount: scores.length,
  };
}

// ------------------------------------------------------------------ driver

export interface RunResult {
  readonly scores: readonly ImageScore[];
  readonly real: Aggregate;
  readonly synthetic: Aggregate;
  readonly byFile: ReadonlyMap<string, ImageScore>;
  readonly missingOcr: readonly string[];
}

export function scoreCorpus(corpus: Corpus, cache: OcrCache, extractor: Extractor): RunResult {
  const scores: ImageScore[] = [];
  const missingOcr: string[] = [];

  for (const capture of corpus.captures) {
    const record = cache.records.get(capture.file);
    if (!record) {
      missingOcr.push(capture.file);
      continue;
    }
    const notice = corpus.notices.get(capture.notice);
    if (!notice) throw new Error(`no ground truth for notice ${capture.notice}`);
    scores.push(scoreImage(capture, notice, record, extractor));
  }

  return {
    scores,
    real: aggregate(scores.filter((s) => s.capture.bucket === 'real')),
    synthetic: aggregate(scores.filter((s) => s.capture.bucket === 'synthetic')),
    byFile: new Map(scores.map((s) => [s.capture.file, s])),
    missingOcr,
  };
}
