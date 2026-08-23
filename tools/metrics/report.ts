/**
 * Carta metrics harness — rendering.
 *
 * AUTHORSHIP: Claude. Harness infrastructure. No counting happens here.
 *
 * The output is shaped by one rule from tools/corpus/README.md, and it is not
 * a presentation preference:
 *
 *   > Report real and synthetic as separate buckets. Never merge them into one
 *   > headline accuracy number.
 *
 * So there is no single number anywhere in this report. Real captures are the
 * accuracy claim; synthetic degradations are a robustness supplement; and the
 * rows are conditions, because "94% on flat, 71% on creased" is the result and
 * the average of those two is not.
 */

import type { Aggregate, Cell, ImageScore, RunResult } from './score.ts';
import { precision, recall } from './score.ts';
import type { Corpus } from './corpus.ts';
import {
  CONDITION_CAVEATS,
  CONTROLLED_SET,
  EXCLUDED_FROM_CONDITION_CLAIM,
  MIN_IMAGES_FOR_RATE,
  REAL_CONDITIONS,
  REPEATABILITY_PAIR,
  SYNTHETIC_CONDITIONS,
} from './corpus.ts';
import { CRITICAL_FIELDS, orderedFields, specFor } from './fields.ts';
import type { ChainResult, ApprovalResult } from './logic.ts';
import type { OcrCache } from './ocr-cache.ts';

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(0)}%`;
}

function ceilingCell(cell: Cell | undefined): string {
  if (!cell || cell.ceiling.support === 0) return '—';
  return `${pct(cell.ceiling.hits / cell.ceiling.support)} (${cell.ceiling.hits}/${cell.ceiling.support})`;
}

function recallCell(cell: Cell | undefined): string {
  if (!cell || cell.counts.tp + cell.counts.fn === 0) return '—';
  return pct(recall(cell.counts));
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function conditionsInOrder(agg: Aggregate, bucket: 'real' | 'synthetic'): string[] {
  const canonical = bucket === 'real' ? REAL_CONDITIONS : SYNTHETIC_CONDITIONS;
  return canonical.filter((c) => agg.conditions.includes(c));
}

/**
 * Split conditions into the ones with enough images to carry a rate and the
 * ones that are existence proofs. The second group never appears as a
 * percentage anywhere in this report.
 */
function splitByCoverage(
  agg: Aggregate,
  bucket: 'real' | 'synthetic',
): { rateable: string[]; existenceOnly: string[] } {
  const rateable: string[] = [];
  const existenceOnly: string[] = [];
  for (const condition of conditionsInOrder(agg, bucket)) {
    const images = agg.byCondition.get(condition)?.images ?? 0;
    (images >= MIN_IMAGES_FOR_RATE ? rateable : existenceOnly).push(condition);
  }
  return { rateable, existenceOnly };
}

/**
 * field × condition, one metric per cell.
 *
 * Columns are only the conditions that clear MIN_IMAGES_FOR_RATE. The rest are
 * deliberately absent: putting a one-image column beside an eight-image one in
 * the same table invites exactly the comparison the data cannot support.
 */
function matrix(
  agg: Aggregate,
  bucket: 'real' | 'synthetic',
  render: (cell: Cell | undefined) => string,
  fieldFilter: (field: string) => boolean,
): string {
  const { rateable } = splitByCoverage(agg, bucket);
  const fields = orderedFields(agg.fields).filter(fieldFilter);
  if (fields.length === 0 || rateable.length === 0) return '_no data_';

  const header = rateable.map((c) => `${c} (n=${agg.byCondition.get(c)?.images ?? 0})`);
  const rows = fields.map((field) => {
    const perCondition = agg.byFieldCondition.get(field);
    return [
      `\`${field}\``,
      ...rateable.map((condition) => render(perCondition?.get(condition))),
      render(agg.byField.get(field)),
    ];
  });
  return table(['field', ...header, `**all (${agg.imageCount})**`], rows);
}

/**
 * The small-n conditions, as raw counts. No percentages appear here by design.
 */
function existenceProofs(agg: Aggregate, bucket: 'real' | 'synthetic'): string {
  const { existenceOnly } = splitByCoverage(agg, bucket);
  if (existenceOnly.length === 0) return '';

  const rows = existenceOnly.map((condition) => {
    const cell = agg.byCondition.get(condition);
    const images = cell?.images ?? 0;
    const found = cell?.ceiling.hits ?? 0;
    const present = cell?.ceiling.support ?? 0;
    const caveat = CONDITION_CAVEATS[condition as keyof typeof CONDITION_CAVEATS];
    return [
      `\`${condition}\``,
      `${images} image${images === 1 ? '' : 's'}`,
      `${found}/${present} printed fields found`,
      caveat === undefined ? '' : 'see footnote',
    ];
  });

  return [
    '### Existence proofs — too few images to carry a rate',
    '',
    `Conditions with fewer than ${MIN_IMAGES_FOR_RATE} images are reported as counts, never`,
    'as percentages, and are kept out of the table above. **A percentage over one',
    'image is not a measurement** — it says one photograph worked, not that the',
    'condition is handled. What these rows are good for is the negative: they show',
    'the pipeline does not fall over on a magenta cast or an upside-down page.',
    '',
    table(['condition', 'images', 'OCR ceiling, as a count', ''], rows),
    '',
    'These images *are* included in the **all** column above, which pools every',
    `capture in the bucket (n=${agg.imageCount}).`,
  ].join('\n');
}

function imageCountsByCondition(agg: Aggregate, bucket: 'real' | 'synthetic'): string {
  const conditions = conditionsInOrder(agg, bucket);
  const { rateable } = splitByCoverage(agg, bucket);
  return table(
    ['condition', ...conditions],
    [
      ['images', ...conditions.map((c) => String(agg.byCondition.get(c)?.images ?? 0))],
      [
        'supports a rate',
        ...conditions.map((c) => (rateable.includes(c) ? 'yes' : '**no — n too low**')),
      ],
    ],
  );
}

// ------------------------------------------------------------------ sections

function bucketSection(
  title: string,
  blurb: string,
  agg: Aggregate,
  bucket: 'real' | 'synthetic',
): string {
  const printed = (field: string): boolean => specFor(field).evidence === 'printed';
  const nonPrinted = (field: string): boolean => specFor(field).evidence !== 'printed';

  const parts = [
    `## ${title}`,
    '',
    blurb,
    '',
    imageCountsByCondition(agg, bucket),
    '',
    '### OCR ceiling — is the printed value present in the recognised text',
    '',
    'The most any extraction could get right. A field below this line was lost',
    'by extraction; a field at it was lost by the recogniser. Only defined for',
    'fields that are literally printed on the page.',
    '',
    matrix(agg, bucket, ceilingCell, printed),
    '',
    '### Extraction recall — of the values that were there, how many were produced',
    '',
    matrix(agg, bucket, recallCell, () => true),
    '',
    '### Extraction precision — of the values produced, how many were right',
    '',
    matrix(agg, bucket, (cell) => (cell && cell.counts.tp + cell.counts.fp > 0 ? pct(precision(cell.counts)) : '—'), () => true),
  ];

  const proofs = existenceProofs(agg, bucket);
  if (proofs !== '') parts.push('', proofs);

  const derivedAndSemantic = orderedFields(agg.fields).filter(nonPrinted);
  if (derivedAndSemantic.length > 0) {
    parts.push(
      '',
      `**No ceiling is reported for ${derivedAndSemantic.map((f) => `\`${f}\``).join(', ')}** —`,
      'these are derived or semantic fields with no string on the page to find.',
      'See tools/metrics/fields.ts for what each one is.',
    );
  }
  return parts.join('\n');
}

function controlledSection(result: RunResult): string {
  const rows: string[][] = [];
  const ratios: number[] = [];
  for (const file of CONTROLLED_SET) {
    const score = result.byFile.get(file);
    if (!score) continue;
    let hits = 0;
    let support = 0;
    for (const hit of score.ceiling.values()) {
      support += 1;
      if (hit) hits += 1;
    }
    const counts = { tp: 0, fp: 0, fn: 0 };
    for (const c of score.perField.values()) {
      counts.tp += c.tp;
      counts.fp += c.fp;
      counts.fn += c.fn;
    }
    if (support > 0) ratios.push(hits / support);
    rows.push([
      `\`${file}\``,
      score.capture.condition,
      String(score.ocrLines),
      support === 0 ? '—' : `${pct(hits / support)} (${hits}/${support})`,
      recallCell({ counts, ceiling: { hits, support }, images: 1 }),
    ]);
  }

  // State what the five rows actually show, rather than leaving the reader to
  // infer it. When they are identical that is a result — it says the physical
  // conditions in this corpus do not reach the recogniser's limit — and saying
  // so is more honest than presenting a flat table as though it were a gradient.
  const spread = ratios.length === 0 ? 0 : Math.max(...ratios) - Math.min(...ratios);
  const reading =
    spread === 0
      ? [
          '**Reading: no condition effect is measurable at the OCR ceiling.** All five',
          'conditions put every printed field into the text. Dim, angled, shadowed and',
          'creased captures of this sheet are equally readable, so a claim of the form',
          '"X% on flat, Y% on creased" is not available from this corpus at this stage —',
          'the honest statement is that all five conditions saturate. The discriminating',
          'signal is in Bucket B, where heavy defocus and motion blur do break the text',
          'layer. Once an extraction cascade is wired in, a condition effect can still',
          'appear *below* the ceiling: the values are all present, and finding them in a',
          'skewed or creased layout is a harder problem than reading them.',
        ].join('\n')
      : [
          `**Reading: the ceiling spans ${pct(Math.min(...ratios))} to ${pct(Math.max(...ratios))} across the five conditions.**`,
          'Because the sheet is identical, that spread is the condition effect and nothing else.',
        ].join('\n');

  // Per-field detail across the five, which is where a condition effect shows
  // up field by field rather than smeared into one page-level average.
  const fields = orderedFields(
    result.byFile.get(CONTROLLED_SET[0] ?? '')?.ceiling.keys() ?? [],
  );
  const detailRows = fields.map((field) => [
    `\`${field}\``,
    ...CONTROLLED_SET.map((file) => {
      const hit = result.byFile.get(file)?.ceiling.get(field);
      return hit === undefined ? '—' : hit ? '✓' : '**✗**';
    }),
  ]);

  return [
    '## Controlled comparison — one sheet, five conditions',
    '',
    'These five photographs are **the same physical sheet** of notice 01. The',
    'ground truth is identical by construction, so any difference between them',
    'is the physical condition and cannot be the document. Everywhere else in',
    'this report a condition comparison is confounded by layout: the creased',
    'captures are of different notices with different fields. Here they are not.',
    '',
    'This is the most defensible measurement in the corpus.',
    '',
    table(['capture', 'condition', 'OCR lines', 'OCR ceiling', 'extraction recall'], rows),
    '',
    reading,
    '',
    '### Per field, across the five',
    '',
    '✓ = the printed value was found in the recognised text.',
    '',
    table(
      ['field', ...CONTROLLED_SET.map((f) => f.replace('sar7-', '').replace('.jpg', ''))],
      detailRows,
    ),
  ].join('\n');
}

function repeatabilitySection(result: RunResult): string {
  const [a, b] = REPEATABILITY_PAIR;
  const scoreA = result.byFile.get(a);
  const scoreB = result.byFile.get(b);
  if (!scoreA || !scoreB) return '';

  const disagreements: string[] = [];
  for (const [field, hit] of scoreA.ceiling) {
    const other = scoreB.ceiling.get(field);
    if (other !== undefined && other !== hit) disagreements.push(field);
  }

  return [
    '## Repeatability — the error bar',
    '',
    `\`${a}\` and \`${b}\` are two takes of the same sheet under the same`,
    'condition. Nothing differs but the shutter press, so any gap between them',
    'is capture noise. **A condition difference smaller than this gap is not a',
    'finding.**',
    '',
    table(
      ['capture', 'OCR lines', 'fields found'],
      [
        [`\`${a}\``, String(scoreA.ocrLines), `${[...scoreA.ceiling.values()].filter(Boolean).length}/${scoreA.ceiling.size}`],
        [`\`${b}\``, String(scoreB.ocrLines), `${[...scoreB.ceiling.values()].filter(Boolean).length}/${scoreB.ceiling.size}`],
      ],
    ),
    '',
    disagreements.length === 0
      ? '**The two takes agree on every field.** Capture noise is below the resolution of this corpus, so condition differences elsewhere can be read at face value.'
      : `Fields where the two takes disagree: ${disagreements.map((f) => `\`${f}\``).join(', ')}. Differences of this size elsewhere in the report are noise, not signal.`,
  ].join('\n');
}

function logicSection(chain: ChainResult, approval: ApprovalResult): string {
  const rows = [...chain.checks, ...approval.checks].map((check) => [
    check.passed ? '✅' : '❌',
    check.name,
    check.detail,
  ]);
  const parts = [
    '## Logic assertions — not OCR',
    '',
    'The case chain and the approval notice test the data model and the',
    'scheduling rules, not the recogniser. They run against ground truth, so',
    'they hold regardless of how any photograph reads.',
    '',
    table(['', 'assertion', 'detail'], rows),
  ];
  if (chain.warnings.length > 0) {
    parts.push('', '### ⚠️ Corpus defects found', '');
    for (const warning of chain.warnings) parts.push(`- ${warning}`);
  }
  return parts.join('\n');
}

function excludedFootnote(): string {
  const excluded = Object.entries(EXCLUDED_FROM_CONDITION_CLAIM);
  const caveats = Object.entries(CONDITION_CAVEATS);
  if (excluded.length === 0 && caveats.length === 0) return '';

  const parts = ['## Footnotes'];
  if (caveats.length > 0) {
    parts.push(
      '',
      '**What these conditions do and do not measure.** A high score on one of',
      'these is narrower than it looks; the narrowing is here so the number is not',
      'read as more than it is.',
      '',
      ...caveats.map(([condition, reason]) => `- **\`${condition}\`** — ${String(reason)}`),
    );
  }
  if (excluded.length > 0) {
    parts.push(
      '',
      '**Excluded from the "physical conditions" headline claim.**',
      '',
      ...excluded.map(([condition, reason]) => `- **\`${condition}\`** — ${String(reason)}`),
    );
  }
  return parts.join('\n');
}

// -------------------------------------------------------------------- report

export interface ReportContext {
  readonly corpus: Corpus;
  readonly cache: OcrCache;
  readonly extractorId: string;
  readonly result: RunResult;
  readonly chain: ChainResult;
  readonly approval: ApprovalResult;
  readonly generatedAt: string;
}

export function renderMarkdown(context: ReportContext): string {
  const { corpus, cache, result, extractorId } = context;
  const realCount = result.scores.filter((s) => s.capture.bucket === 'real').length;
  const syntheticCount = result.scores.length - realCount;

  const engineCaveat = [
    '> **On the engine.** The harness reads the corpus with **Apple Vision** on',
    '> macOS. The app reads notices through `expo-mlkit-ocr` — whose name is',
    '> misleading on iOS: with the plugin at its default `iosEngine: "auto"` it',
    '> installs no ML Kit pod and compiles the **Apple Vision** path instead.',
    '> Verified in `ios/Podfile.lock` (`ExpoMlkitOcr` depends on `ExpoModulesCore`',
    '> alone), in the podspec\'s `EXPO_MLKIT_OCR_DISABLE_MLKIT` switch, and in the',
    '> module source, where the ML Kit branch sits behind `#if canImport`. Both',
    '> sides use `.accurate` with language correction on.',
    '>',
    '> So this is the same engine family as the iOS build, not a stand-in. Two',
    '> gaps remain. The harness pins Vision revision 3 and declares `en-US,es-ES`',
    '> while the app pins nothing and declares nothing (English only) — measured',
    '> at **zero difference across all 79 images** on this corpus, which is ASCII',
    '> throughout. And macOS Vision and iOS Vision are separate model builds; only',
    '> a device run closes that. **Android is genuinely ML Kit** and these figures',
    '> do not describe it.',
  ].join('\n');

  const nullCaveat =
    '> **No extraction cascade is wired in yet.** Precision and recall below are\n' +
    '> the floor — the `null` extractor produces nothing. The OCR ceiling is the\n' +
    '> number that carries information today: it says how much of each field is\n' +
    '> available in the text for the cascade to reach.';

  const header = [
    '# Carta — extraction metrics',
    '',
    '_Generated by `npm run metrics`. Do not edit by hand._',
    '',
    table(
      ['', ''],
      [
        ['generated', context.generatedAt],
        ['extractor', `\`${extractorId}\``],
        ['OCR engine', `\`${cache.engine}\`${cache.revision === undefined ? '' : ` (revision ${cache.revision})`}`],
        ['OCR input width', `${cache.maxWidth}px`],
        ['notices', `${corpus.notices.size} (9 photographed, 1 logic-only)`],
        ['real captures', String(realCount)],
        ['synthetic variants', `${syntheticCount} (seed ${corpus.syntheticSeed})`],
      ],
    ),
    '',
    engineCaveat,
    ...(extractorId === 'null' ? ['', nullCaveat] : []),
  ].join('\n');

  const sections = [
    header,
    bucketSection(
      'Bucket A — real captures (the accuracy claim)',
      [
        'Printed on paper and photographed on an iPhone under real physical',
        'conditions. **This is the honest accuracy number.** It is never merged',
        'with Bucket B.',
      ].join('\n'),
      result.real,
      'real',
    ),
    bucketSection(
      'Bucket B — synthetic degradations (robustness supplement)',
      [
        'Blur, defocus, noise, underexposure and recompression applied in software',
        'to the eight clean captures, with a fixed seed. These exist because iPhone',
        'computational photography sharpens text after capture, so genuine motion',
        'blur cannot be photographed with the stock camera. **A robustness',
        'supplement, not an accuracy claim.**',
      ].join('\n'),
      result.synthetic,
      'synthetic',
    ),
    controlledSection(result),
    repeatabilitySection(result),
    logicSection(context.chain, context.approval),
    excludedFootnote(),
  ].filter((section) => section !== '');

  return `${sections.join('\n\n---\n\n')}\n`;
}

/** The machine-readable twin of the markdown, for diffing runs. */
export function renderJson(context: ReportContext): unknown {
  const bucket = (agg: Aggregate): unknown => ({
    images: agg.imageCount,
    conditions: agg.conditions,
    byField: Object.fromEntries(
      [...agg.byField].map(([field, cell]) => [
        field,
        {
          evidence: specFor(field).evidence,
          critical: CRITICAL_FIELDS.includes(field),
          ...cell.counts,
          precision: precision(cell.counts) ?? null,
          recall: recall(cell.counts) ?? null,
          ceiling: cell.ceiling.support === 0 ? null : cell.ceiling.hits / cell.ceiling.support,
          ceilingCounts: cell.ceiling,
        },
      ]),
    ),
    byFieldCondition: Object.fromEntries(
      [...agg.byFieldCondition].map(([field, perCondition]) => [
        field,
        Object.fromEntries(
          [...perCondition].map(([condition, cell]) => [
            condition,
            {
              ...cell.counts,
              precision: precision(cell.counts) ?? null,
              recall: recall(cell.counts) ?? null,
              ceiling: cell.ceiling.support === 0 ? null : cell.ceiling.hits / cell.ceiling.support,
              images: cell.images,
            },
          ]),
        ),
      ]),
    ),
  });

  const perImage = (score: ImageScore): unknown => ({
    notice: score.capture.notice,
    bucket: score.capture.bucket,
    condition: score.capture.condition,
    ocrLines: score.ocrLines,
    ceiling: Object.fromEntries(score.ceiling),
    spurious: score.spurious,
  });

  return {
    // No timestamp: this file is committed and diffed between runs, and a date
    // in it would make every re-run a change. METRICS.md carries the date for
    // human readers.
    extractor: context.extractorId,
    ocr: {
      engine: context.cache.engine,
      revision: context.cache.revision ?? null,
      maxWidth: context.cache.maxWidth,
      caveat:
        'macOS Apple Vision. The iOS app also runs Apple Vision — expo-mlkit-ocr ' +
        'installs no ML Kit pod at its default iosEngine "auto" — so this is the same ' +
        'engine family, pending a device-side confirmation that iOS Vision agrees with ' +
        'macOS Vision. Android is ML Kit and is not described by these figures.',
    },
    syntheticSeed: context.corpus.syntheticSeed,
    buckets: { real: bucket(context.result.real), synthetic: bucket(context.result.synthetic) },
    controlledSet: CONTROLLED_SET,
    repeatabilityPair: REPEATABILITY_PAIR,
    logic: {
      chain: context.chain.checks,
      chainWarnings: context.chain.warnings,
      approval: context.approval.checks,
    },
    images: Object.fromEntries(context.result.scores.map((s) => [s.capture.file, perImage(s)])),
  };
}
