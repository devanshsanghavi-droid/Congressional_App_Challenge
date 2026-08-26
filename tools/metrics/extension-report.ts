/**
 * The extension set — accented and mixed-case names.
 *
 * Reported **alongside** the frozen corpus figure, never merged with it and
 * never averaged into it. See `tools/corpus-extension/README.md` for why the
 * corpus was not edited instead.
 *
 * This measures the parser and nothing else: the pages are hand-authored lines
 * with hand-authored boxes, so the OCR ceiling is 100% by construction. A number
 * from here is not comparable to a photographed number and must never be quoted
 * as though it were.
 *
 *   node tools/metrics/extension-report.ts --extractor src/extraction/index.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './corpus.ts';
import { loadExtractor, nullExtractor, CORPUS_CLOCK_MS } from './extractor.ts';
import type { Extractor } from './extractor.ts';

interface ExtensionNotice {
  readonly id: string;
  readonly form: string;
  readonly why: string;
  readonly ground_truth: Readonly<Record<string, string>>;
  readonly lines: readonly { text: string; confidence: number; box: { x: number; y: number; w: number; h: number } }[];
}

/** Ground truth uses corpus names; the island emits app names. */
const TO_CORPUS: Readonly<Record<string, string>> = {
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
 * Exact match, with whitespace tidied.
 *
 * Deliberately NOT accent-insensitive. The whole point of this set is that the
 * value handed back to the user carries its accents — a comparison that folded
 * them would report success for `JOSE RAMIREZ` when the page says `JOSÉ RAMÍREZ`,
 * which is the exact failure the set exists to detect.
 */
const same = (a: string, b: string): boolean =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--extractor');
  const extractor: Extractor =
    at >= 0 && argv[at + 1] !== undefined ? await loadExtractor(argv[at + 1] as string) : nullExtractor;

  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tools/corpus-extension/notices.json'), 'utf8'),
  ) as { notices: readonly ExtensionNotice[] };

  console.log(`\nextractor: ${extractor.id}`);
  console.log('EXTENSION SET — hand-authored pages. OCR ceiling is 100% by construction.');
  console.log('Never merged with, or averaged into, the frozen corpus number.\n');

  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const notice of raw.notices) {
    const input = {
      lines: notice.lines,
      text: notice.lines.map((l) => l.text).join('\n'),
      width: 1700,
      height: 2200,
      nowMs: CORPUS_CLOCK_MS,
    };
    const got = extractor.run(input);
    const produced = new Map<string, string>();
    for (const [key, field] of Object.entries(got.fields)) {
      if (!field || field.value === undefined) continue;
      produced.set(TO_CORPUS[key] ?? key, String(field.value));
    }

    console.log(`--- ${notice.id}  (${notice.form})`);
    for (const [field, want] of Object.entries(notice.ground_truth)) {
      const mine = produced.get(field);
      if (mine === undefined) {
        fn += 1;
        console.log(`    MISS  ${field.padEnd(26)} want ${JSON.stringify(want)}`);
      } else if (same(mine, want)) {
        tp += 1;
        console.log(`    ok    ${field.padEnd(26)} ${JSON.stringify(mine)}`);
      } else {
        fp += 1;
        fn += 1;
        console.log(`    WRONG ${field.padEnd(26)} want ${JSON.stringify(want)} got ${JSON.stringify(mine)}`);
      }
    }
    console.log('');
  }

  const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  console.log(`extension precision ${pct(tp, tp + fp)}  (${tp}/${tp + fp})`);
  console.log(`extension recall    ${pct(tp, tp + fn)}  (${tp}/${tp + fn})`);
}

await main();
