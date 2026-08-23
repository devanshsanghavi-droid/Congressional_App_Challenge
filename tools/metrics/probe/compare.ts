/**
 * FEASIBILITY PROBE — comparison runner. **Not shipping code.**
 *
 * Scores both probe variants through the real harness and rolls the result up
 * over the nine fields Devansh's pdftotext probe called "core", so the two runs
 * are directly comparable.
 *
 * The number that matters is not either column on its own. It is:
 *   - clean digital text -> photographed OCR   (what photography costs)
 *   - text only -> text plus geometry          (what Layer 1 is worth)
 *
 * Run:  npm run probe
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { PROBE_CORE_FIELDS } from './patterns.ts';

interface FieldStats {
  tp: number;
  fp: number;
  fn: number;
  evidence: string;
}

interface Bucket {
  byField: Record<string, FieldStats>;
  byFieldCondition: Record<string, Record<string, { tp: number; fp: number; fn: number; images: number }>>;
}

interface Metrics {
  buckets: { real: Bucket; synthetic: Bucket };
  images: Record<string, { bucket: string; condition: string; spurious: string[] }>;
}

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '../../..');

function runProbe(extractorPath: string): Metrics {
  execFileSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'tools/metrics/run.ts', '--extractor', extractorPath],
    { cwd: REPO, stdio: 'ignore' },
  );
  return JSON.parse(readFileSync(join(REPO, 'tools/metrics/out/metrics.json'), 'utf8')) as Metrics;
}

function rollUp(bucket: Bucket, fields: readonly string[]): { tp: number; fp: number; fn: number } {
  const total = { tp: 0, fp: 0, fn: 0 };
  for (const field of fields) {
    const stats = bucket.byField[field];
    if (!stats) continue;
    total.tp += stats.tp;
    total.fp += stats.fp;
    total.fn += stats.fn;
  }
  return total;
}

const rate = (n: number, d: number): string => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
const precision = (c: { tp: number; fp: number }): string => rate(c.tp, c.tp + c.fp);
const recall = (c: { tp: number; fn: number }): string => rate(c.tp, c.tp + c.fn);

function main(): void {
  const variants: [string, string][] = [
    ['text only', 'tools/metrics/probe/text-only.ts'],
    ['text + geometry', 'tools/metrics/probe/spatial.ts'],
  ];

  const results = variants.map(([name, path]) => [name, runProbe(path)] as const);

  console.log('\nDETERMINISTIC PROBE — real OCR cache, 23 real captures, 9 conditions');
  console.log('Baseline for comparison: pdftotext, clean digital text, 100% / 95.5% on core fields.\n');

  const pad = (s: string, n: number): string => s.padEnd(n);
  console.log(`${pad('variant', 20)}${pad('core P', 10)}${pad('core R', 10)}${pad('all P', 10)}${pad('all R', 10)}`);
  console.log('-'.repeat(60));
  for (const [name, metrics] of results) {
    const core = rollUp(metrics.buckets.real, PROBE_CORE_FIELDS);
    const all = rollUp(metrics.buckets.real, Object.keys(metrics.buckets.real.byField));
    console.log(
      `${pad(name, 20)}${pad(precision(core), 10)}${pad(recall(core), 10)}` +
        `${pad(precision(all), 10)}${pad(recall(all), 10)}`,
    );
  }

  const best = results[results.length - 1]?.[1];
  if (!best) return;

  // fp and fn are reported straight rather than split into "wrong" and
  // "missing": a wrong value counts as both, and a value invented for a field
  // the notice does not have counts as fp alone, so the two cannot be
  // separated from these totals without double-counting. The spurious list
  // below names the second kind explicitly.
  console.log('\nCORE FIELDS, text + geometry, real captures');
  console.log(`${pad('field', 28)}${pad('tp', 5)}${pad('fp', 5)}${pad('fn', 5)}${pad('precision', 11)}recall`);
  console.log('-'.repeat(62));
  for (const field of PROBE_CORE_FIELDS) {
    const s = best.buckets.real.byField[field];
    if (!s) continue;
    console.log(
      `${pad(field, 28)}${pad(String(s.tp), 5)}${pad(String(s.fp), 5)}${pad(String(s.fn), 5)}` +
        `${pad(precision(s), 11)}${recall(s)}`,
    );
  }

  const spurious = new Map<string, number>();
  for (const record of Object.values(best.images)) {
    if (record.bucket !== 'real') continue;
    for (const field of record.spurious) spurious.set(field, (spurious.get(field) ?? 0) + 1);
  }
  if (spurious.size > 0) {
    console.log('\nINVENTED — a value produced for a field the notice does not have.');
    console.log('This is the failure CLAUDE.md §4 forbids outright, so it is listed by name.');
    for (const [field, count] of [...spurious].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${pad(field, 28)}${count} of 23 captures`);
    }
  }

  console.log('\nCORE RECALL BY CONDITION — real captures (n in brackets)');
  const conditions = new Map<string, { tp: number; fp: number; fn: number; images: number }>();
  for (const field of PROBE_CORE_FIELDS) {
    const per = best.buckets.real.byFieldCondition[field];
    if (!per) continue;
    for (const [condition, cell] of Object.entries(per)) {
      const acc = conditions.get(condition) ?? { tp: 0, fp: 0, fn: 0, images: 0 };
      acc.tp += cell.tp;
      acc.fp += cell.fp;
      acc.fn += cell.fn;
      acc.images = Math.max(acc.images, cell.images);
      conditions.set(condition, acc);
    }
  }
  console.log('-'.repeat(62));
  for (const [condition, acc] of [...conditions].sort((a, b) => b[1].images - a[1].images)) {
    // n<3 conditions print counts only — a rate over one image is not a rate.
    const shown = acc.images >= 3 ? `P ${precision(acc)}  R ${recall(acc)}` : `${acc.tp}/${acc.tp + acc.fn} fields correct`;
    console.log(`${pad(condition, 20)}${pad(`[n=${acc.images}]`, 9)}${shown}`);
  }

  console.log('\nSynthetic bucket, text + geometry (robustness supplement, scored separately)');
  const synthCore = rollUp(best.buckets.synthetic, PROBE_CORE_FIELDS);
  console.log(`  core precision ${precision(synthCore)}   core recall ${recall(synthCore)}\n`);
}

main();
