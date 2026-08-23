/**
 * Carta metrics harness — OCR cache producer (driver).
 *
 * AUTHORSHIP: Claude. Harness infrastructure. No extraction logic here.
 *
 * Runs an OCR engine over every corpus image once and caches the result as
 * JSON, so the scorer — which runs in bare Node on every `npm test` — never
 * needs a camera, a simulator, or an OCR engine of its own.
 *
 * The cache is committed. That is deliberate: it makes the metrics table
 * reproducible by anyone who clones the repo, on any platform, and it means a
 * change to the extraction cascade can be scored against a *fixed* text layer.
 * If the OCR text moved every run you could not tell whether a template change
 * helped or the recogniser just had a better day.
 *
 *   npm run corpus:ocr                     # every image, replacing the cache
 *   npm run corpus:ocr -- --only na960x    # just the images whose name matches
 *   npm run corpus:ocr -- --max-width 1200
 *
 * `--only` exists because the corpus gets re-staged in place: notices are
 * reshot, and re-running OCR over all 79 images to pick up three of them makes
 * the other 76 look like they moved when they did not. With `--only`, the
 * unchanged records are left byte-identical and the diff shows exactly what
 * changed.
 *
 * See ../README.md for why the harness engine is not the app's engine.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const CORPUS = join(REPO, 'tools/corpus');
const PHOTOS = join(CORPUS, 'photos');
const SYNTHETIC = join(PHOTOS, 'synthetic');
const BUILD_DIR = join(HERE, '.build');
const SOURCE = join(HERE, 'vision-ocr.swift');
const BINARY = join(BUILD_DIR, 'vision-ocr');

/**
 * Default OCR input width. 1700 is not arbitrary: the synthetic variants were
 * generated at 1700px, so downscaling the 2000px real captures to the same
 * width is what makes the two buckets comparable. If they reached the
 * recogniser at different scales, part of every real-vs-synthetic difference
 * would just be resolution.
 */
const DEFAULT_MAX_WIDTH = 1700;

/**
 * Languages declared to the recogniser.
 *
 * The corpus is English, Spanish and bilingual, and a recogniser told to expect
 * only English mangles "FECHA LIMITE" and the Spanish month names. Note this is
 * a place the harness and the app differ: `expo-mlkit-ocr` leaves
 * `recognitionLanguages` unset on its Vision path, which means English only.
 * Settable so the size of that gap can be measured rather than assumed.
 */
const DEFAULT_LANGUAGES = 'en-US,es-ES';

interface Options {
  maxWidth: number;
  languages: string;
  force: boolean;
  /** Substrings; an image is processed if its filename contains any of them. */
  only: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    maxWidth: DEFAULT_MAX_WIDTH,
    languages: DEFAULT_LANGUAGES,
    force: false,
    only: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max-width') {
      const next = argv[++i];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 400) {
        throw new Error(`--max-width needs an integer >= 400, got ${String(next)}`);
      }
      options.maxWidth = parsed;
    } else if (arg === '--languages') {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) throw new Error('--languages needs a value');
      options.languages = next;
    } else if (arg === '--only') {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) throw new Error('--only needs a pattern');
      options.only.push(next);
    } else if (arg === '--force') {
      options.force = true;
    } else {
      throw new Error(`unknown argument: ${String(arg)}`);
    }
  }
  return options;
}

/** Compile the Swift producer, skipping the build when the binary is current. */
function buildProducer(force: boolean): void {
  mkdirSync(BUILD_DIR, { recursive: true });
  const fresh =
    !force && existsSync(BINARY) && statSync(BINARY).mtimeMs > statSync(SOURCE).mtimeMs;
  if (fresh) {
    console.log('vision-ocr: binary up to date');
    return;
  }
  if (process.platform !== 'darwin') {
    throw new Error(
      'The Apple Vision producer only builds on macOS. The committed OCR cache ' +
        'under tools/corpus/ocr/ is what lets the scorer run everywhere else — ' +
        'run `npm run metrics` instead.',
    );
  }
  console.log('vision-ocr: compiling…');
  execFileSync('swiftc', ['-O', SOURCE, '-o', BINARY], { stdio: 'inherit' });
}

function imagesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jpg'))
    .sort()
    .map((name) => join(dir, name));
}

function main(): void {
  const { maxWidth, languages, force, only } = parseArgs(process.argv.slice(2));
  buildProducer(force);

  const allImages = [...imagesIn(PHOTOS), ...imagesIn(SYNTHETIC)];
  if (allImages.length === 0) throw new Error(`no images found under ${PHOTOS}`);

  const images =
    only.length === 0
      ? allImages
      : allImages.filter((path) => only.some((pattern) => basename(path).includes(pattern)));
  if (images.length === 0) {
    throw new Error(`--only ${only.join(' ')} matched none of the ${allImages.length} images`);
  }

  console.log(
    `vision-ocr: ${images.length}${only.length === 0 ? '' : ` of ${allImages.length}`} ` +
      `images at max width ${maxWidth}px`,
  );

  // One invocation per batch keeps process spawns down without risking the
  // argv length limit on a long corpus.
  const BATCH = 20;
  const records: Record<string, unknown>[] = [];
  const startedAt = Date.now();
  for (let i = 0; i < images.length; i += BATCH) {
    const batch = images.slice(i, i + BATCH);
    const stdout = execFileSync(BINARY, [String(maxWidth), languages, ...batch], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    for (const line of stdout.split('\n')) {
      if (line.trim() !== '') records.push(JSON.parse(line) as Record<string, unknown>);
    }
    process.stdout.write(`  ${Math.min(i + BATCH, images.length)}/${images.length}\r`);
  }
  process.stdout.write('\n');

  if (records.length !== images.length) {
    throw new Error(`expected ${images.length} records, got ${records.length}`);
  }

  const engine = String(records[0]?.['engine']);
  const outDir = join(CORPUS, 'ocr', engine);
  if (only.length === 0) {
    // A full run clears the directory rather than merging: a stale record from
    // a previous width or a deleted image would otherwise sit in the cache
    // unnoticed and silently contribute to the metrics table.
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  // A partial run cannot clear, so it checks instead. Two ways the cache could
  // go quietly wrong: a record left behind by an image that no longer exists,
  // and a record written at a different downscale width, which would make the
  // buckets incomparable — the one thing this harness exists to prevent.
  if (only.length > 0) {
    const live = new Set(allImages.map((path) => `${basename(path)}.json`));
    const stale = readdirSync(outDir).filter((name) => name.endsWith('.json') && !live.has(name));
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} cache record(s) have no image: ${stale.slice(0, 5).join(', ')}. ` +
          'Run a full `npm run corpus:ocr` instead.',
      );
    }
    for (const name of readdirSync(outDir)) {
      if (!name.endsWith('.json')) continue;
      const existing = JSON.parse(readFileSync(join(outDir, name), 'utf8')) as { maxWidth: number };
      if (existing.maxWidth !== maxWidth) {
        throw new Error(
          `cache was built at ${existing.maxWidth}px and this run is ${maxWidth}px. ` +
            'Mixing widths makes the buckets incomparable — run a full `npm run corpus:ocr`.',
        );
      }
    }
  }

  // Timing is measured here rather than stored in the cache: the cache is
  // committed and must be byte-identical across runs, and a duration never is.
  const elapsedMs = Date.now() - startedAt;

  let totalLines = 0;
  for (const record of records) {
    const file = String(record['file']);
    totalLines += (record['lines'] as unknown[]).length;
    writeFileSync(join(outDir, `${file}.json`), `${JSON.stringify(record, null, 2)}\n`);
  }

  console.log(
    `vision-ocr: wrote ${records.length} record(s) to tools/corpus/ocr/${engine}/\n` +
      `  ${totalLines} text lines total, ` +
      `${(elapsedMs / records.length).toFixed(0)}ms mean per image (wall clock, not cached)`,
  );
}

main();
