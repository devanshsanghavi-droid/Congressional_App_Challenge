/**
 * Carta metrics harness — reading the cached OCR text layer.
 *
 * AUTHORSHIP: Claude. Harness infrastructure.
 *
 * The scorer never runs an OCR engine. It reads what `ocr/run-ocr.ts` cached
 * under tools/corpus/ocr/<engine>/, which is committed. Two reasons that matter:
 *
 *   - the metrics table is reproducible by anyone who clones the repo, with no
 *     Mac, no camera and no simulator;
 *   - the text layer is *fixed*, so when a number moves after a change to the
 *     extraction cascade, the cascade is the only thing that could have moved
 *     it. Re-running OCR every time would smear the two together.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CORPUS_DIR } from './corpus.ts';

export interface OcrBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
  readonly box: OcrBox;
}

export interface OcrRecord {
  readonly file: string;
  readonly engine: string;
  readonly revision?: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** Width the recogniser actually saw, after the downscale. */
  readonly ocrWidth: number;
  readonly ocrHeight: number;
  readonly maxWidth: number;
  readonly lines: readonly OcrLine[];
}

export interface OcrCache {
  readonly engine: string;
  readonly revision?: number;
  readonly maxWidth: number;
  readonly records: ReadonlyMap<string, OcrRecord>;
}

const OCR_ROOT = join(CORPUS_DIR, 'ocr');

/** Engines with a cache on disk, e.g. ["apple-vision"]. */
export function availableEngines(): string[] {
  if (!existsSync(OCR_ROOT)) return [];
  return readdirSync(OCR_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function loadOcrCache(engine?: string): OcrCache {
  const engines = availableEngines();
  if (engines.length === 0) {
    throw new Error(
      'No OCR cache found under tools/corpus/ocr/. Run `npm run corpus:ocr` ' +
        '(macOS only) to build one.',
    );
  }
  const chosen = engine ?? engines[0];
  if (chosen === undefined || !engines.includes(chosen)) {
    throw new Error(`No OCR cache for engine "${String(engine)}". Have: ${engines.join(', ')}`);
  }

  const dir = join(OCR_ROOT, chosen);
  const records = new Map<string, OcrRecord>();
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const record = JSON.parse(readFileSync(join(dir, name), 'utf8')) as OcrRecord;
    records.set(record.file, record);
  }
  if (records.size === 0) throw new Error(`OCR cache for "${chosen}" is empty`);

  const first = records.values().next().value as OcrRecord;

  // A cache mixing two downscale widths would make the buckets incomparable,
  // which is the one thing this harness exists to avoid. Catch it here rather
  // than let it quietly skew a table.
  for (const record of records.values()) {
    if (record.maxWidth !== first.maxWidth) {
      throw new Error(
        `OCR cache "${chosen}" mixes downscale widths (${first.maxWidth} and ` +
          `${record.maxWidth}). Re-run \`npm run corpus:ocr -- --force\`.`,
      );
    }
  }

  return {
    engine: chosen,
    ...(first.revision === undefined ? {} : { revision: first.revision }),
    maxWidth: first.maxWidth,
    records,
  };
}

/** The recognised lines joined into one blob, in reading order. */
export function fullText(record: OcrRecord): string {
  return record.lines.map((line) => line.text).join('\n');
}
