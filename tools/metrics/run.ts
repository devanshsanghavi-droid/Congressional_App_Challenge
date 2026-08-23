/**
 * Carta metrics harness — CLI.
 *
 * AUTHORSHIP: Claude. Harness infrastructure.
 *
 *   npm run metrics
 *   npm run metrics -- --extractor src/extraction/index.ts
 *   npm run metrics -- --engine apple-vision --check
 *
 * Writes tools/metrics/out/METRICS.md and metrics.json, and prints a short
 * summary. `--check` makes it exit non-zero if any logic assertion fails, which
 * is how CI uses it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus } from './corpus.ts';
import type { Extractor } from './extractor.ts';
import { loadExtractor, nullExtractor } from './extractor.ts';
import { checkApproval, checkCaseChain } from './logic.ts';
import { loadOcrCache } from './ocr-cache.ts';
import { renderJson, renderMarkdown } from './report.ts';
import { precision, recall, scoreCorpus } from './score.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');

interface Options {
  extractorPath?: string;
  engine?: string;
  check: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { check: false };
  const value = (index: number, flag: string): string => {
    const next = argv[index];
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--extractor') options.extractorPath = value(++i, '--extractor');
    else if (arg === '--engine') options.engine = value(++i, '--engine');
    else if (arg === '--check') options.check = true;
    else throw new Error(`unknown argument: ${String(arg)}`);
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const corpus = loadCorpus();
  const cache = loadOcrCache(options.engine);
  const extractor: Extractor = options.extractorPath
    ? await loadExtractor(options.extractorPath)
    : nullExtractor;

  const result = scoreCorpus(corpus, cache, extractor);
  if (result.missingOcr.length > 0) {
    throw new Error(
      `No OCR cache entry for ${result.missingOcr.length} image(s): ` +
        `${result.missingOcr.slice(0, 5).join(', ')}. Run \`npm run corpus:ocr\`.`,
    );
  }

  const chain = checkCaseChain(corpus);
  const approval = checkApproval(corpus);

  const context = {
    corpus,
    cache,
    extractorId: extractor.id,
    result,
    chain,
    approval,
    generatedAt: new Date().toISOString().slice(0, 10),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'METRICS.md'), renderMarkdown(context));
  writeFileSync(join(OUT_DIR, 'metrics.json'), `${JSON.stringify(renderJson(context), null, 2)}\n`);

  // --- summary -----------------------------------------------------------
  const line = (label: string, value: string): void =>
    console.log(`  ${label.padEnd(34)} ${value}`);
  const pct = (v: number | undefined): string => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

  console.log(`\nCarta metrics — extractor "${extractor.id}", OCR "${cache.engine}" @ ${cache.maxWidth}px\n`);

  for (const [name, agg] of [
    ['real captures', result.real],
    ['synthetic variants', result.synthetic],
  ] as const) {
    let hits = 0;
    let support = 0;
    const counts = { tp: 0, fp: 0, fn: 0 };
    for (const cell of agg.byField.values()) {
      hits += cell.ceiling.hits;
      support += cell.ceiling.support;
      counts.tp += cell.counts.tp;
      counts.fp += cell.counts.fp;
      counts.fn += cell.counts.fn;
    }
    console.log(`${name} (${agg.imageCount} images, ${agg.conditions.length} conditions)`);
    line('OCR ceiling, printed fields', `${pct(support === 0 ? undefined : hits / support)} (${hits}/${support})`);
    line('extraction precision', pct(precision(counts)));
    line('extraction recall', pct(recall(counts)));
    console.log('');
  }

  const failures = [...chain.checks, ...approval.checks].filter((c) => !c.passed);
  console.log(`logic assertions: ${chain.checks.length + approval.checks.length - failures.length} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  ❌ ${failure.name} — ${failure.detail}`);
  for (const warning of chain.warnings) console.log(`  ⚠️  ${warning.split('\n')[0]}`);

  console.log(`\nwrote tools/metrics/out/METRICS.md and metrics.json`);

  if (options.check && failures.length > 0) process.exitCode = 1;
}

await main();
