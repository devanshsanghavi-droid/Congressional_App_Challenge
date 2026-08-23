/**
 * FEASIBILITY PROBE — does the model recover the long tail without breaking
 * the core? **Not shipping code.** See ../patterns.ts for the authorship note.
 *
 * The question, from Devansh: regex already gets the core fields at ~96%
 * precision on real OCR. It misses `employer`, `citation`, `household_size`
 * and `appointment_time`, each of which appears on one or two notices. Does a
 * 1.5B model recover those *without corrupting what regex already gets right*?
 *
 * Runs Qwen2.5-1.5B-Instruct Q4_K_M under llama.cpp over the real OCR cache,
 * grammar-constrained, and scores against ground truth with the same
 * comparators the metrics harness uses.
 *
 *   npm run probe:llm
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus } from '../../corpus.ts';
import { loadOcrCache } from '../../ocr-cache.ts';
import { CORPUS_CLOCK_MS } from '../../extractor.ts';
import { truthFields } from '../../score.ts';
import { valuesMatch } from '../../fields.ts';
import { extract as spatialExtract } from '../spatial.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAMMAR = join(HERE, 'extract.gbnf');
const ASK = join(HERE, 'ask.sh');

/** Fields the grammar covers, split by who is expected to be good at them. */
const CORE = ['notice_date', 'deadline_date', 'effective_date', 'case_number'];
const LONG_TAIL = ['employer', 'citation', 'household_size', 'appointment_time'];

/** One flat capture per notice that carries at least one long-tail field. */
const CAPTURES = [
  'sar7-clean-01.jpg',
  'na960x-clean-06.jpg',
  'mc210-clean-12.jpg',
  'na960y-clean-14.jpg',
  'hcv-angled-20.jpg',
];

const INSTRUCTIONS = [
  'You are reading a US government benefit notice. Extract the fields below as JSON.',
  '',
  'Rules:',
  '- Copy values exactly as printed. Do not calculate or infer anything.',
  '- If the notice does not state a field, output null. Do not guess.',
  '- Never substitute the notice date for a deadline.',
  '- deadline_date is a date the recipient must act by, not the date the notice was written.',
  '- citation is a regulation reference such as "MPP 63-508". If there is none, output null.',
  '',
  'NOTICE TEXT:',
].join('\n');

type Extracted = Record<string, string | number | null>;

function ask(text: string): Extracted | undefined {
  const promptFile = join(tmpdir(), `carta-probe-${process.pid}.txt`);
  writeFileSync(promptFile, `${INSTRUCTIONS}\n${text}\n`);
  const raw = execFileSync('bash', [ASK, GRAMMAR, '260', promptFile], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  try {
    return JSON.parse(raw.trim()) as Extracted;
  } catch {
    console.log(`  !! unparseable output: ${raw.trim().slice(0, 120)}`);
    return undefined;
  }
}

/** MM/DD/YYYY (what the grammar emits) to the ISO the comparators expect. */
function normalise(value: string | number | null): string | number | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return value;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return value;
}

interface Tally { correct: number; wrong: number; missed: number; invented: number }
const blank = (): Tally => ({ correct: 0, wrong: 0, missed: 0, invented: 0 });

function main(): void {
  if (!existsSync(process.env['CARTA_MODEL'] ?? join(process.env['HOME'] ?? '', 'models/qwen2.5-1.5b-instruct-q4_k_m.gguf'))) {
    throw new Error('Model not found. Set CARTA_MODEL or place the GGUF in ~/models/.');
  }

  const corpus = loadCorpus();
  const cache = loadOcrCache('apple-vision');
  const llmTally = { core: blank(), longTail: blank() };
  const regexTally = { core: blank(), longTail: blank() };

  for (const file of CAPTURES) {
    const capture = corpus.byFile.get(file);
    const record = cache.records.get(file);
    if (!capture || !record) continue;
    const notice = corpus.notices.get(capture.notice);
    if (!notice) continue;

    const text = record.lines.map((l) => l.text).join('\n');
    const truth = truthFields(notice);
    const llm = ask(text);
    const regex = spatialExtract({
      lines: record.lines,
      text,
      width: record.ocrWidth,
      height: record.ocrHeight,
      nowMs: CORPUS_CLOCK_MS,
    });

    console.log(`\n${file}  (notice ${capture.notice}, ${notice.form_id})`);
    console.log(`  ${'field'.padEnd(18)}${'truth'.padEnd(24)}${'model'.padEnd(24)}regex`);

    for (const group of ['core', 'longTail'] as const) {
      for (const field of group === 'core' ? CORE : LONG_TAIL) {
        const want = truth.get(field);
        const wantStr = typeof want === 'string' ? want : undefined;

        const gotLlm = llm === undefined ? undefined : normalise(llm[field] ?? null);
        const gotRegex = regex.fields[field]?.value;

        const judge = (got: string | number | undefined, tally: Tally): string => {
          if (wantStr === undefined) {
            if (got === undefined) return '—';
            tally.invented += 1;
            return `INVENTED ${String(got)}`;
          }
          if (got === undefined) {
            tally.missed += 1;
            return 'missing';
          }
          if (valuesMatch(field, wantStr, got)) {
            tally.correct += 1;
            return `ok ${String(got)}`;
          }
          tally.wrong += 1;
          return `WRONG ${String(got)}`;
        };

        const l = judge(gotLlm, llmTally[group]);
        const r = judge(gotRegex, regexTally[group]);
        if (wantStr === undefined && l === '—' && r === '—') continue;
        console.log(`  ${field.padEnd(18)}${(wantStr ?? '(none)').padEnd(24)}${l.padEnd(24)}${r}`);
      }
    }
  }

  console.log('\n\nTOTALS across the five captures');
  console.log(`${'  '.padEnd(2)}${'group'.padEnd(12)}${'who'.padEnd(8)}${'correct'.padEnd(9)}${'wrong'.padEnd(7)}${'missing'.padEnd(9)}invented`);
  console.log('-'.repeat(60));
  for (const group of ['core', 'longTail'] as const) {
    for (const [who, tallies] of [['model', llmTally], ['regex', regexTally]] as const) {
      const t = tallies[group];
      console.log(
        `  ${group.padEnd(12)}${who.padEnd(8)}${String(t.correct).padEnd(9)}` +
          `${String(t.wrong).padEnd(7)}${String(t.missed).padEnd(9)}${t.invented}`,
      );
    }
  }
  console.log('\n"invented" = a value produced for a field this notice does not have.');
  console.log('CLAUDE.md §4 forbids exactly that, so it is counted separately from "wrong".\n');
}

main();
