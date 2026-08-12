import type { BenchmarkCase } from './benchmark';

/**
 * Fixtures for the week 1 latency gate.
 *
 * AUTHORSHIP NOTE: the grammar below is a deliberately minimal **measurement
 * stub**, not the extraction grammar. The real GBNF grammar and the extraction
 * schema live in /src/extraction and are the student's work (CLAUDE.md, SPEC
 * §13). This one exists only so the benchmark can measure what grammar-
 * constrained decoding costs versus free generation. Do not grow it into the
 * real thing — write that one properly, in the island.
 */

/**
 * A fictional CalFresh notice of action.
 *
 * Entirely invented: no real person, case number, or office. It is written to
 * be *representative* rather than short — roughly the density and length of a
 * real one-page notice — because prompt tokens dominate inference cost and a
 * toy three-line prompt would produce a benchmark number that flatters us and
 * predicts nothing.
 *
 * The SSN below is deliberately present so the same fixture can double as a
 * redaction test input. It is 000-00-0000, which is not a valid issued SSN.
 */
export const SAMPLE_NOTICE_TEXT = `COUNTY OF SANTA CLARA
SOCIAL SERVICES AGENCY
DEPARTMENT OF EMPLOYMENT AND BENEFIT SERVICES
NOTICE OF ACTION

Date: 03/14/2026
Case Name: MARIA GARCIA
Case Number: 1234567
Worker: J. RIVERA
Worker Phone: (408) 555-0142
Social Security Number: 000-00-0000

NOTICE OF ACTION - CALFRESH DISCONTINUANCE

Effective 04/01/2026 your CalFresh benefits will be discontinued.

Reason: We did not receive your Semi-Annual Report (SAR 7) for the report month
of February 2026. Your completed report was due on 03/05/2026. Because we did
not receive it, your household is no longer eligible to receive CalFresh
benefits beginning 04/01/2026.

WHAT YOU CAN DO

If you send us your completed and signed SAR 7 by 03/31/2026, we may be able to
restore your benefits without a new application. You must also send:

  - Proof of all income received in February 2026 for everyone in your household
    (pay stubs, or a signed statement from your employer)
  - Proof of your current rent or mortgage payment
  - Proof of any child care costs you paid

You may turn in your report and verification in person at any county office, by
mail, by fax, or through your online account.

YOUR HEARING RIGHTS

If you think this action is wrong, you may ask for a state hearing. Your request
must be received within 90 days of the date of this notice. If you ask for a
hearing before 04/01/2026, your CalFresh benefits may continue at the same
amount while you wait for the hearing decision. If the hearing decision is not
in your favor, you may have to pay back the benefits you received while waiting.

If you have questions about this notice, call your worker at the number shown
above. Free legal help may be available in your county.

State law: MPP 63-505.1, 63-504.2`;

/**
 * A minimal GBNF grammar constraining output to a flat JSON object with three
 * fields. Enough to measure the cost of constrained decoding; nothing like the
 * real schema.
 *
 * The interesting line is `date`: it forces exactly `NN/NN/NNNN`, so a
 * malformed date is not merely rejected after generation, it is *unreachable* —
 * the sampler is never offered a token that would break the pattern. That is
 * the property a JSON schema cannot express and it is why the real grammar is
 * worth hand-writing.
 */
export const BENCHMARK_GRAMMAR = String.raw`
root        ::= "{" ws "\"action_type\"" ws ":" ws action "," ws "\"notice_date\"" ws ":" ws date "," ws "\"deadline_date\"" ws ":" ws date ws "}"
action      ::= "\"approval\"" | "\"denial\"" | "\"reduction\"" | "\"discontinuance\"" | "\"info_request\"" | "\"recert_due\""
date        ::= "\"" digit digit "/" digit digit "/" digit digit digit digit "\""
digit       ::= [0-9]
ws          ::= [ \t\n]*
`;

function extractionPrompt(noticeText: string): string {
  // Qwen2.5 Instruct chat template. Written out explicitly rather than using a
  // chat helper so the benchmark measures exactly the tokens we intend.
  return `<|im_start|>system
You extract structured data from United States government benefit notices. You only report values that appear in the text. You never guess a date.<|im_end|>
<|im_start|>user
Read this notice and return JSON with the action type, the notice date, and the deadline the person must meet.

${noticeText}<|im_end|>
<|im_start|>assistant
`;
}

function explanationPrompt(noticeText: string): string {
  return `<|im_start|>system
You explain government benefit letters in plain language at a fifth-grade reading level. You only restate what the letter says. You never add a deadline that is not in the letter and you never tell someone they are ineligible.<|im_end|>
<|im_start|>user
Explain this letter in four short sections: What this says. What you must do. By when. How to appeal.

${noticeText}<|im_end|>
<|im_start|>assistant
`;
}

/**
 * The four cases the gate needs, and why each one exists:
 *
 *  1. extraction-grammar   The real shape of the extraction call. The number
 *                          that decides 1.5B vs 0.5B.
 *  2. extraction-free      Same prompt, no grammar. The difference between 1
 *                          and 2 is what constrained decoding costs — and
 *                          whether unconstrained output is even valid JSON.
 *  3. explanation-stream   The long generation. Governs how the streamed
 *                          explanation feels, and it is the shot in the video.
 *  4. extraction-short     Same task on a quarter of the text, standing in for
 *                          the region-selection optimisation. The gap between
 *                          1 and 4 is the prize for not sending the whole page.
 */
export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    name: 'extraction-grammar',
    prompt: extractionPrompt(SAMPLE_NOTICE_TEXT),
    grammar: BENCHMARK_GRAMMAR,
    maxTokens: 128,
  },
  {
    name: 'extraction-free',
    prompt: extractionPrompt(SAMPLE_NOTICE_TEXT),
    maxTokens: 128,
  },
  {
    name: 'explanation-stream',
    prompt: explanationPrompt(SAMPLE_NOTICE_TEXT),
    maxTokens: 400,
  },
  {
    name: 'extraction-short',
    prompt: extractionPrompt(
      SAMPLE_NOTICE_TEXT.split('\n').slice(0, 18).join('\n')
    ),
    grammar: BENCHMARK_GRAMMAR,
    maxTokens: 128,
  },
];
