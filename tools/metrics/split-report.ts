/**
 * In-sample vs held-out, real captures only.
 *
 * The cascade in `/src/extraction` was developed against notices **01–07** with
 * notices **08, 09 and 10 held out** — not their text, not their ground truth,
 * not their failures. This script reports the two separately, because a single
 * blended figure hides exactly the thing a holdout exists to reveal.
 *
 * It reuses `scoreCorpus` rather than reimplementing the arithmetic, so the
 * split can never disagree with the headline number in METRICS.md. It writes
 * nothing; `run.ts` remains the only producer of the canonical report.
 *
 *   node tools/metrics/split-report.ts --extractor src/extraction/index.ts
 */

import { loadCorpus } from './corpus.ts';
import type { Corpus } from './corpus.ts';
import { loadOcrCache } from './ocr-cache.ts';
import { loadExtractor, nullExtractor } from './extractor.ts';
import type { Extractor } from './extractor.ts';
import { scoreCorpus } from './score.ts';

const HELD_OUT = new Set(['08', '09', '10']);

/**
 * The nine fields the earlier probes called "core", kept identical so this run
 * is comparable to the 96.4% / 87.6% those probes posted. The harness scores
 * every field in the ground truth, including a long tail — `employer`,
 * `gross_income`, `worker_id`, `report_month` — that this cascade does not
 * attempt at all, so a whole-corpus recall figure understates the fields the app
 * actually schedules from.
 */
const CORE = new Set([
  'recipient_name', 'program', 'action_type', 'case_number', 'notice_date',
  'deadline_date', 'effective_date', 'appeal_deadline', 'aid_paid_pending_deadline',
]);

function subset(corpus: Corpus, keep: (notice: string) => boolean): Corpus {
  return {
    ...corpus,
    captures: corpus.captures.filter((c) => c.bucket === 'real' && keep(c.notice)),
  };
}

function report(name: string, corpus: Corpus, cache: ReturnType<typeof loadOcrCache>, extractor: Extractor): void {
  const result = scoreCorpus(corpus, cache, extractor);
  const images = corpus.captures.length;
  const notices = new Set(corpus.captures.map((c) => c.notice)).size;

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let hits = 0;
  let support = 0;
  const rows: [string, number, number, number, number, number][] = [];
  for (const [field, cell] of result.real.byField) {
    tp += cell.counts.tp;
    fp += cell.counts.fp;
    fn += cell.counts.fn;
    hits += cell.ceiling.hits;
    support += cell.ceiling.support;
    rows.push([field, cell.counts.tp, cell.counts.fp, cell.counts.fn, cell.ceiling.hits, cell.ceiling.support]);
  }

  let ctp = 0;
  let cfp = 0;
  let cfn = 0;
  for (const [field, cell] of result.real.byField) {
    if (!CORE.has(field)) continue;
    ctp += cell.counts.tp;
    cfp += cell.counts.fp;
    cfn += cell.counts.fn;
  }

  const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  console.log(`\n=== ${name} — ${notices} notices, ${images} real captures ===`);
  if (images < 3) {
    console.log('  n < MIN_IMAGES_FOR_RATE (3): counts only, no percentages.');
  }
  console.log(`  OCR ceiling      ${pct(hits, support)}  (${hits}/${support})`);
  console.log(`  precision        ${pct(tp, tp + fp)}  (${tp}/${tp + fp})`);
  console.log(`  recall           ${pct(tp, tp + fn)}  (${tp}/${tp + fn})`);
  console.log(`  CORE precision   ${pct(ctp, ctp + cfp)}  (${ctp}/${ctp + cfp})`);
  console.log(`  CORE recall      ${pct(ctp, ctp + cfn)}  (${ctp}/${ctp + cfn})`);
  console.log('\n  field                       ceiling      precision      recall');
  for (const [field, ftp, ffp, ffn, fh, fs] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ftp + ffp + ffn === 0 && fs === 0) continue;
    console.log(
      `  ${field.padEnd(26)} ${pct(fh, fs).padStart(8)}  ${pct(ftp, ftp + ffp).padStart(10)}   ${pct(ftp, ftp + ffn).padStart(9)}   (tp ${ftp} fp ${ffp} fn ${ffn})`,
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--extractor');
  const extractor: Extractor =
    at >= 0 && argv[at + 1] !== undefined ? await loadExtractor(argv[at + 1] as string) : nullExtractor;

  const corpus = loadCorpus();
  const cache = loadOcrCache();

  console.log(`\nextractor: ${extractor.id}`);
  console.log('Real captures only. In-sample and held-out are NEVER merged.');

  report('IN-SAMPLE (notices 01-07, developed against)', subset(corpus, (n) => !HELD_OUT.has(n)), cache, extractor);
  report('HELD OUT (notices 08-10, never opened)', subset(corpus, (n) => HELD_OUT.has(n)), cache, extractor);
}

await main();
