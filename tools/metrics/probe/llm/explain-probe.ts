/**
 * FEASIBILITY PROBE — the plain-language explanation, over all ten notices.
 * **Not shipping code.** See ../patterns.ts for the authorship note.
 *
 * AUTHORSHIP: Claude. Harness infrastructure, app-side grammar. Nothing here
 * is in /src/extraction.
 *
 * THE QUESTION
 * ------------
 * The grammar has now been three different things (NOTES.md 2026-08-20 and
 * 2026-08-24). This probe is what decided between them, and it stays because
 * the current design is a claim that has to keep being true:
 *
 *   the explanation has NO "by when" section, so the model is never asked for
 *   the number, and the sanity pass is a net rather than the mechanism.
 *
 * It runs the real grammar, the real prompt builder and the real sanity pass
 * over all ten corpus notices, and prints what the model actually writes.
 * Notice 10 is the one that matters most: it is the approval, it states no
 * deadline, and the first design fabricated one for a notice in this shape.
 *
 *   npm run probe:explain              all ten
 *   npm run probe:explain -- --only 10 one of them
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is macOS llama.cpp, not llama.rn on a phone. Same engine family, a
 * different build, and `--temp 0` here where the app samples at 0.3. So it
 * measures the *grammar and the sanity pass*, which are deterministic text
 * processing, and not latency or on-device behaviour. Never quote a number
 * from here as an on-device number.
 *
 * Notice 10 has no photograph in the corpus (README: what it tests is
 * scheduling, not OCR), so its text comes from the PDF rather than from the
 * OCR cache. Every other notice uses the real committed OCR text — the same
 * bytes the app would hand the model. The report says which is which.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, loadGroundTruth, noticeId, REAL_CAPTURES } from '../../corpus.ts';
import { fullText, loadOcrCache } from '../../ocr-cache.ts';
import {
  EXPLANATION_GRAMMAR,
  buildExplanationPrompt,
} from '../../../../src/lib/llm/explain-grammar.ts';
import { checkExplanation, parseSections } from '../../../../src/lib/llm/explain-check.ts';

const MODEL = process.env['CARTA_MODEL']
  ?? join(process.env['HOME'] ?? '', 'models/qwen2.5-1.5b-instruct-q4_k_m.gguf');

/**
 * `n_predict` in `explain.ts`. Kept as a named constant because under the digit
 * ban the failure looked like a truncation at this number and was not — it was
 * a degeneration loop that would have exhausted any budget.
 */
const N_PREDICT = Number(argValue('--tokens') ?? 260);

/** Long-form date, the way `notice/[id].tsx` renders a confirmed value. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** One flat capture per notice, so OCR quality is not the variable under test. */
function flatCaptureFor(notice: string): string | undefined {
  return REAL_CAPTURES.find((c) => c.notice === notice && c.condition === 'flat')?.file
    ?? REAL_CAPTURES.find((c) => c.notice === notice)?.file;
}

interface Source {
  readonly text: string;
  readonly origin: string;
}

function pdfText(file: string): string {
  // pymupdf rather than a committed cache: notice 10 has no photograph, this is
  // a probe, and the corpus is frozen (CLAUDE.md §12) so nothing new goes in it.
  const script = [
    'import fitz, sys',
    'doc = fitz.open(sys.argv[1])',
    'print("\\n".join(p.get_text() for p in doc))',
  ].join('\n');
  return execFileSync('python3', ['-c', script, join(REPO_ROOT, 'tools/corpus/notices', file)], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * Run one prompt under the grammar and return only what the model generated.
 *
 * NOT `ask.sh`. That helper finds the response by looking for a sentinel at the
 * end of the echoed prompt, and this llama-cli build (b10470) truncates a long
 * echoed prompt — which swallows the sentinel and returns the banner as if it
 * were the answer. The first run of this probe reported "16 digits emitted by
 * the model" that were in fact the build number in llama.cpp's own banner.
 *
 * So the extraction is anchored on the grammar instead: `root` begins with the
 * literal `SAYS: `, so the generation is the LAST line starting with `SAYS:`
 * onward, up to llama.cpp's timing line. The prompt also contains the word
 * SAYS, which is why it is the last occurrence and not the first.
 */
function ask(prompt: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'carta-explain-'));
  const promptFile = join(dir, 'prompt.txt');
  const grammarFile = join(dir, 'explain.gbnf');
  writeFileSync(promptFile, prompt);
  writeFileSync(grammarFile, EXPLANATION_GRAMMAR);

  const stdout = execFileSync(
    'llama-cli',
    [
      '-m', MODEL,
      '-f', promptFile,
      '-n', String(N_PREDICT),
      '--temp', '0',
      '-no-cnv',
      '-st',
      '--log-disable',
      '--simple-io',
      '-c', '4096',
      '--grammar-file', grammarFile,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  const lines = stdout.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*>?\s*SAYS:/.test(lines[i] ?? '')) start = i;
  }
  if (start === -1) return stdout.trim(); // nothing recognisable; show it raw

  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\[ Prompt:/.test(line) || /^Exiting\.\.\./.test(line)) break;
    out.push(line);
  }
  // The first line may still carry conversation mode's "> " prefix.
  out[0] = (out[0] ?? '').replace(/^\s*>\s*/, '');
  return out.join('\n').trim();
}

function main(): void {

  const only = argValue('--only');
  const truths = loadGroundTruth().filter((t) => only === undefined || noticeId(t.file) === only);
  const ocr = loadOcrCache();

  console.log('Carta — explanation grammar over the corpus');
  console.log(`grammar: three sections, digits ALLOWED, no placeholders; n_predict=${N_PREDICT}; temp 0; macOS llama.cpp`);
  console.log('');

  let shown = 0;
  let withheld = 0;

  for (const truth of truths) {
    const id = noticeId(truth.file);
    const capture = flatCaptureFor(id);
    const record = capture === undefined ? undefined : ocr.records.get(capture);

    let source: Source;
    if (record !== undefined && capture !== undefined) {
      source = { text: fullText(record), origin: `OCR of ${capture} (${ocr.engine})` };
    } else {
      source = { text: pdfText(truth.file), origin: `PDF text of ${truth.file} — no capture exists` };
    }

    const fields = truth.fields as Readonly<Record<string, string | undefined>>;
    const deadline = fields['deadline_date'];
    const hearingBy = fields['aid_paid_pending_deadline'];

    const prompt = buildExplanationPrompt({
      program: truth.program,
      office: truth.agency,
      actionType: truth.action_type,
      ...(deadline === undefined ? {} : { deadline: longDate(deadline) }),
      ...(hearingBy === undefined ? {} : { hearingBy: longDate(hearingBy) }),
      noticeText: source.text,
    });

    const raw = ask(prompt).trim();
    const sections = parseSections(raw);
    // Every confirmed date, matching what Notice Detail passes — see
    // `ExplainRequest.confirmedDates`. Scoring against only the deadline made
    // the check reject correct explanations that mentioned the effective date.
    const confirmed = [
      deadline,
      hearingBy,
      fields['appeal_deadline'],
      fields['notice_date'],
      fields['effective_date'],
    ]
      .filter((v): v is string => v !== undefined)
      .map(longDate);
    const check =
      sections === undefined
        ? undefined
        : checkExplanation(
            [sections.says, sections.doing, sections.appeal].join(' '),
            confirmed,
          );

    console.log('='.repeat(78));
    console.log(`NOTICE ${id} — ${truth.program} — ${truth.action_type}`);
    console.log(`source:   ${source.origin}`);
    console.log(`deadline: ${deadline ?? 'NONE STATED'}   hearing-by: ${hearingBy ?? 'none'}`);
    if (truth.note) console.log(`note:     ${truth.note}`);
    console.log('-'.repeat(78));
    console.log('BY WHEN (rendered by Notice Detail, never generated):');
    console.log(`  | ${deadline === undefined ? 'no date on this letter' : longDate(deadline)}`);
    console.log('');
    console.log('GENERATED:');
    console.log(indent(raw));
    console.log('');

    if (sections === undefined) {
      withheld += 1;
      console.log('VERDICT: WITHHELD — incomplete (parseSections found no four sections)');
    } else if (check !== undefined && !check.ok) {
      withheld += 1;
      console.log(`VERDICT: WITHHELD — ${check.problems.join(', ')}`);
    } else {
      shown += 1;
      console.log('VERDICT: SHOWN');
    }
    // Reported per notice so nothing hides in a summary line. Digits are now
    // ALLOWED — the count is here to show the model writing ordinary sentences
    // with numbers in them, which is exactly what the digit ban prevented.
    const digits = (raw.match(/\d/g) ?? []).length;
    const placeholders = (raw.match(/\{[a-zA-Z]+\}/g) ?? []).length;
    console.log(`digits emitted: ${digits}  ·  placeholders (should be 0, none exist): ${placeholders}`);
    console.log('');
  }

  console.log('='.repeat(78));
  console.log(`shown: ${shown}   withheld: ${withheld}   of ${truths.length}`);
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  | ${line}`)
    .join('\n');
}

main();
