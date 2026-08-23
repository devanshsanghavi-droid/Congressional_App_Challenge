/**
 * Carta metrics harness — the corpus model.
 *
 * AUTHORSHIP: Claude. Harness infrastructure. No extraction logic here.
 *
 * tools/corpus/MANIFEST.md describes which photograph shows which notice under
 * which physical condition, in prose, for a human. This file is the same
 * information in a form the scorer can read, plus the three structural facts
 * about the corpus that the metrics table is built on:
 *
 *   - the bucket split (real captures vs synthetic degradations), which must
 *     never collapse into one number;
 *   - the controlled set — five photographs of the *same physical sheet*, so a
 *     difference between them is the condition and nothing else;
 *   - the case chain — notices 01 and 02 are one household's story.
 *
 * `tests/node/corpus-integrity.test.ts` checks this file against what is
 * actually on disk, so a photograph added, renamed or removed without updating
 * the map fails the build instead of silently dropping out of the metrics.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Locate the repository by walking up from the working directory until the
 * corpus is found.
 *
 * Not `import.meta.url`, deliberately: this module is loaded two ways — by
 * Node directly when the CLI runs, and by Jest through a CommonJS transform
 * where `import.meta` does not exist and is a syntax error. Walking up works
 * under both, and it fails with a sentence that says what to do rather than a
 * module-resolution stack trace.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'tools/corpus/ground_truth.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir || parent === parse(dir).root) {
      throw new Error(
        'Cannot find tools/corpus/ground_truth.json above ' +
          `${process.cwd()}. Run the harness from inside the repository.`,
      );
    }
    dir = parent;
  }
}

export const REPO_ROOT = findRepoRoot();
export const CORPUS_DIR = join(REPO_ROOT, 'tools/corpus');

// ---------------------------------------------------------------- conditions

/**
 * Physical capture conditions. These are the rows of the headline table — the
 * result Devansh wants to be able to state is "deadline extraction is X% on
 * flat captures and Y% on creased", so the condition, not the average, is the
 * unit of reporting.
 */
export const REAL_CONDITIONS = [
  'flat',
  'dim',
  'angled',
  'creased',
  'shadow',
  'dim-angled',
  'colour-cast',
  'inverted',
  'blur-attempt',
] as const;

/** Software degradations from tools/corpus/tools/degrade.py, fixed seed. */
export const SYNTHETIC_CONDITIONS = [
  'motionblur',
  'motionblur-diag',
  'defocus',
  'defocus-heavy',
  'noise',
  'underexposed',
  'jpeg',
] as const;

export type RealCondition = (typeof REAL_CONDITIONS)[number];
export type SyntheticCondition = (typeof SYNTHETIC_CONDITIONS)[number];
export type Condition = RealCondition | SyntheticCondition;
export type Bucket = 'real' | 'synthetic';

/**
 * Conditions excluded from the "physical conditions" headline claim, with the
 * reason recorded rather than the row quietly deleted.
 *
 * `blur-attempt` is the one entry: cf3776-blur-11.jpg was shot as a motion-blur
 * test and came back near-sharp, because iPhone Deep Fusion detects text and
 * repairs it after capture. It is kept in the corpus and in the report as
 * *evidence for that finding* — it is the reason the blur conditions are
 * synthetic — but it is not a blurred capture and must not be counted as one.
 */
export const EXCLUDED_FROM_CONDITION_CLAIM: Readonly<Partial<Record<Condition, string>>> = {
  'blur-attempt':
    'Shot as a blur test; iPhone Deep Fusion sharpened the text back. Near-sharp, ' +
    'not a blurred capture. Kept as evidence for why blur is synthetic.',
};

/**
 * Conditions whose score means something narrower than it looks, with the
 * narrowing stated next to the number in the report.
 *
 * `inverted` is the case that matters. Apple Vision reads 180°-rotated text
 * without complaint, so the OCR ceiling on that capture is 100% and reads as
 * "orientation is a solved problem". It is not. The recogniser returns boxes in
 * the *raw frame*, so the letterhead that sits at (0.12, 0.12) upright comes
 * back at (0.82, 0.51). Text-only extraction is unaffected; anything that
 * reasons about where a value sits relative to its label is upside down.
 */
export const CONDITION_CAVEATS: Readonly<Partial<Record<Condition, string>>> = {
  inverted:
    'Text only. The recogniser reads the rotated page, but returns bounding boxes in ' +
    'the raw camera frame — measured against the flat capture of the same sheet, box ' +
    'positions are off by a mean of 0.45 of the frame, and a 180° flip only halves that ' +
    'because the capture is rotation *plus* perspective skew. Regex and lexicon passes ' +
    'are unaffected; spatial anchoring is not usable on this image without a perspective ' +
    'correction, which SPEC §10 cut. Detection is cheap, though: reading order is correct ' +
    'while y runs backwards on 28 of 31 consecutive line pairs.',
  'colour-cast':
    'A chromatic problem, not an exposure one — kept out of the `dim` bucket so the ' +
    'low-light number stays one variable.',
};

// ------------------------------------------------------------------- notices

export interface NoticeTruth {
  /** PDF filename in tools/corpus/notices, and the ground-truth key. */
  readonly file: string;
  readonly form_id: string;
  readonly program: string;
  readonly agency: string;
  readonly language: 'en' | 'es' | 'en+es';
  readonly action_type:
    | 'approval'
    | 'denial'
    | 'reduction'
    | 'discontinuance'
    | 'info_request'
    | 'recert_due';
  readonly fields: Readonly<Record<string, string | readonly string[]>>;
  readonly note: string;
}

interface GroundTruthFile {
  readonly generated_for: string;
  readonly warning: string;
  readonly notices: readonly NoticeTruth[];
}

export function loadGroundTruth(): readonly NoticeTruth[] {
  const raw = readFileSync(join(CORPUS_DIR, 'ground_truth.json'), 'utf8');
  return (JSON.parse(raw) as GroundTruthFile).notices;
}

/** Short id for a notice: "01" … "10", taken from the PDF filename prefix. */
export function noticeId(file: string): string {
  const id = file.slice(0, 2);
  if (!/^\d\d$/.test(id)) throw new Error(`cannot derive notice id from ${file}`);
  return id;
}

// -------------------------------------------------------------- photo → notice

export interface CaptureEntry {
  /** Image filename, which is also the OCR cache key. */
  readonly file: string;
  /** Notice id, "01".."10". */
  readonly notice: string;
  readonly bucket: Bucket;
  readonly condition: Condition;
  /** For synthetic variants: the real capture it was degraded from. */
  readonly derivedFrom?: string;
  /** Free-text caveat carried into the report. */
  readonly note?: string;
}

/**
 * The real captures, transcribed from MANIFEST.md.
 *
 * Two entries need explaining. `bilingual-creased-21` and `-24` were shot
 * believing they were notice 02; they are in fact notice 07, which is also form
 * NA 960X SAR. They were renamed rather than discarded, and because they are
 * two takes of the same sheet under the same condition they double as a
 * repeatability check — see REPEATABILITY_PAIR.
 *
 * There is no capture of notice 10. It is the approval notice, and what it
 * tests is scheduling logic, not OCR (README "Two things the harness must
 * assert", item 2).
 */
const REAL_CAPTURES: readonly CaptureEntry[] = [
  { file: 'sar7-clean-01.jpg', notice: '01', bucket: 'real', condition: 'flat' },
  { file: 'sar7-dim-02.jpg', notice: '01', bucket: 'real', condition: 'dim' },
  { file: 'sar7-angled-03.jpg', notice: '01', bucket: 'real', condition: 'angled' },
  { file: 'sar7-creased-04.jpg', notice: '01', bucket: 'real', condition: 'creased' },
  { file: 'sar7-shadow-05.jpg', notice: '01', bucket: 'real', condition: 'shadow' },

  // Notice 02 was regenerated on 2026-08-18 to fix a chronology defect, and all
  // three captures were reshot. Two of them are not the condition their
  // filename implies, and the filenames were kept so the manifest still lines
  // up — the labels below are what the images actually show.
  { file: 'na960x-clean-06.jpg', notice: '02', bucket: 'real', condition: 'flat' },
  {
    file: 'na960x-dim-07.jpg',
    notice: '02',
    bucket: 'real',
    condition: 'colour-cast',
    note:
      'Strong magenta/purple cast from LED accent lighting, at normal brightness. ' +
      'Filed as its own condition, not as `dim`: it is a chromatic problem, not an ' +
      'exposure one, and mixing it into the low-light bucket would make that number ' +
      'the average of two unrelated variables.',
  },
  {
    file: 'na960x-angled-08.jpg',
    notice: '02',
    bucket: 'real',
    condition: 'inverted',
    note:
      'Rotated ~180° plus perspective skew — the text is upside down. An orientation ' +
      'test, not a skew test, and EXIF does not rescue it: the phone was held level, ' +
      'so the orientation tag says upright while the page is not. Kept apart from ' +
      '`angled`, which is skew at upright orientation.',
  },

  { file: 'cf3776-clean-10.jpg', notice: '03', bucket: 'real', condition: 'flat' },
  {
    file: 'cf3776-blur-11.jpg',
    notice: '03',
    bucket: 'real',
    condition: 'blur-attempt',
    note: 'Deep Fusion sharpened the intended blur away. Evidence, not a blurred capture.',
  },
  { file: 'cf3776-creased-23.jpg', notice: '03', bucket: 'real', condition: 'creased' },

  { file: 'mc210-clean-12.jpg', notice: '04', bucket: 'real', condition: 'flat' },
  {
    file: 'mc210-dimangle-13.jpg',
    notice: '04',
    bucket: 'real',
    condition: 'dim-angled',
    note: 'Two conditions at once — the hardest real capture in the set.',
  },
  { file: 'mc210-creased-22.jpg', notice: '04', bucket: 'real', condition: 'creased' },

  { file: 'na960y-clean-14.jpg', notice: '05', bucket: 'real', condition: 'flat' },
  { file: 'na960y-shadow-15.jpg', notice: '05', bucket: 'real', condition: 'shadow' },

  { file: 'sar7es-clean-16.jpg', notice: '06', bucket: 'real', condition: 'flat' },
  { file: 'sar7es-dim-17.jpg', notice: '06', bucket: 'real', condition: 'dim' },

  { file: 'bilingual-clean-18.jpg', notice: '07', bucket: 'real', condition: 'flat' },
  {
    file: 'bilingual-creased-21.jpg',
    notice: '07',
    bucket: 'real',
    condition: 'creased',
    note: 'Originally shot as notice 02; it is notice 07. First of two takes.',
  },
  {
    file: 'bilingual-creased-24.jpg',
    notice: '07',
    bucket: 'real',
    condition: 'creased',
    note: 'Second take of the same sheet and condition — the repeatability pair.',
  },

  { file: 'ssa-clean-19.jpg', notice: '08', bucket: 'real', condition: 'flat' },
  { file: 'hcv-angled-20.jpg', notice: '09', bucket: 'real', condition: 'angled' },
];

// ------------------------------------------------------ the controlled sets

/**
 * The most defensible measurement in the corpus: five photographs of **one
 * physical sheet** — notice 01 — under five conditions. The ground truth is
 * identical by construction, so every difference between these five scores is
 * the condition and cannot be the document.
 *
 * Everywhere else, "creased is worse than flat" is confounded: the creased
 * shots are of different notices with different layouts and different fields.
 * Here it is not.
 */
export const CONTROLLED_SET: readonly string[] = [
  'sar7-clean-01.jpg',
  'sar7-dim-02.jpg',
  'sar7-angled-03.jpg',
  'sar7-shadow-05.jpg',
  'sar7-creased-04.jpg',
];

/**
 * Two takes of the same sheet under the same condition. The difference between
 * them is pure capture noise — how much a score moves when *nothing* changed
 * but the shutter press. It is the error bar on every other comparison in the
 * report: a condition gap smaller than this gap is not a finding.
 */
export const REPEATABILITY_PAIR: readonly [string, string] = [
  'bilingual-creased-21.jpg',
  'bilingual-creased-24.jpg',
];

/**
 * Notice 02 is the discontinuance caused by the SAR 7 missed in notice 01 —
 * same household, same case number. This is the demo narrative, and the data
 * model has to be able to represent it: a notice that refers back to an earlier
 * one on the same case.
 */
export const CASE_CHAIN = {
  caseNumber: '01-4472-9931',
  recipient: 'MARIA REYES',
  /** The notice that set the deadline. */
  cause: '01',
  /** The notice that resulted from missing it. */
  consequence: '02',
  /** The form named in the consequence notice's stated reason. */
  viaForm: 'SAR 7',
} as const;

/**
 * Fewest images a condition needs before its score may be written as a rate.
 *
 * A percentage over one image is not a measurement. "colour-cast: 100%" means
 * one photograph worked; it says nothing about colour casts. Conditions below
 * this line are reported as raw counts and kept out of any table that invites
 * comparison against `flat` (n=8) or `creased` (n=5) — they are existence
 * proofs that the pipeline does not fall over, not evidence about a rate.
 *
 * Three because that is the smallest n where a rate says anything at all.
 *
 * Note what the 2026-08-19 relabel did to coverage. Moving `na960x-dim-07` to
 * `colour-cast` and `na960x-angled-08` to `inverted` took one image out of each
 * of `dim` and `angled`, leaving both at n=2. So this corpus supports a rate
 * claim for **flat (8) and creased (5)** only; dim (2), angled (2), shadow (2),
 * colour-cast (1), inverted (1), dim-angled (1) and blur-attempt (1) are all
 * existence proofs. That is a real cost of the relabel and the right trade —
 * two honest buckets beat four that mix variables — but it is the reason the
 * report cannot say "X% on dim".
 */
export const MIN_IMAGES_FOR_RATE = 3;

/** The approval notice. No action required, therefore no deadline pressure. */
export const APPROVAL_NOTICE = '10';

// ---------------------------------------------------------------- synthetic

interface SyntheticManifest {
  readonly seed: number;
  readonly note: string;
  readonly variants: readonly {
    readonly file: string;
    readonly derived_from: string;
    readonly condition: string;
    readonly synthetic: true;
  }[];
}

function syntheticConditionFromFilename(file: string): SyntheticCondition {
  // Filenames are "<base>-synth-<condition>.jpg".
  const match = /-synth-(.+)\.jpg$/.exec(file);
  const tag = match?.[1];
  const known = SYNTHETIC_CONDITIONS.find((c) => c === tag);
  if (!known) throw new Error(`unrecognised synthetic condition in ${file}`);
  return known;
}

/**
 * Synthetic variants inherit their notice from the capture they were degraded
 * from, which is read out of the generator's own manifest rather than
 * re-derived from the filename — the generator is the authority on what came
 * from what.
 */
export function loadSyntheticCaptures(realByFile: ReadonlyMap<string, CaptureEntry>): CaptureEntry[] {
  const raw = readFileSync(
    join(CORPUS_DIR, 'photos/synthetic/synthetic_manifest.json'),
    'utf8',
  );
  const manifest = JSON.parse(raw) as SyntheticManifest;
  return manifest.variants.map((variant) => {
    const source = realByFile.get(variant.derived_from);
    if (!source) {
      throw new Error(
        `synthetic ${variant.file} derives from ${variant.derived_from}, ` +
          'which is not a known real capture',
      );
    }
    return {
      file: variant.file,
      notice: source.notice,
      bucket: 'synthetic' as const,
      condition: syntheticConditionFromFilename(variant.file),
      derivedFrom: variant.derived_from,
      note: variant.condition,
    };
  });
}

// -------------------------------------------------------------------- corpus

export interface Corpus {
  readonly notices: ReadonlyMap<string, NoticeTruth>;
  readonly captures: readonly CaptureEntry[];
  readonly byFile: ReadonlyMap<string, CaptureEntry>;
  /** Seed recorded by degrade.py, carried into the report for reproducibility. */
  readonly syntheticSeed: number;
}

export function loadCorpus(): Corpus {
  const notices = new Map<string, NoticeTruth>();
  for (const notice of loadGroundTruth()) notices.set(noticeId(notice.file), notice);

  const realByFile = new Map(REAL_CAPTURES.map((c) => [c.file, c]));
  const captures = [...REAL_CAPTURES, ...loadSyntheticCaptures(realByFile)];

  const seedRaw = readFileSync(join(CORPUS_DIR, 'photos/synthetic/synthetic_manifest.json'), 'utf8');
  const syntheticSeed = (JSON.parse(seedRaw) as SyntheticManifest).seed;

  for (const capture of captures) {
    if (!notices.has(capture.notice)) {
      throw new Error(`${capture.file} maps to notice ${capture.notice}, which has no ground truth`);
    }
  }

  return { notices, captures, byFile: new Map(captures.map((c) => [c.file, c])), syntheticSeed };
}

export { REAL_CAPTURES };
