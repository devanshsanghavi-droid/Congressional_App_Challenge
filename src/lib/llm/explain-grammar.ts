/**
 * The grammar for the plain-language explanation.
 *
 * AUTHORSHIP: Claude. App-side. Distinct from the extraction grammar, which is
 * Devansh's and lives in `/src/extraction` (CLAUDE.md §15) — this constrains
 * *prose*, not a schema.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN, AND WHY IT IS NOT WHAT IT LOOKS LIKE
 * ---------------------------------------------------------------------------
 * The obvious move, after the GBNF work on 2026-08-20, is to constrain any date
 * the model writes to a valid form. That is the wrong lesson from that
 * experiment. What it actually showed is that **a grammar which cannot express
 * "I don't know" converts every gap into a confident fabrication** — the model
 * emitted the notice date as a deadline because the sampler had no legal token
 * sequence for "not stated".
 *
 * So this grammar does not make dates well-formed. It makes them **impossible**:
 *
 *     char ::= [^0-9{}]        <- no digit may ever be generated
 *
 * The model cannot write a date, a dollar amount or a case number, correct or
 * otherwise. Where a date belongs it must emit the literal placeholder
 * `{deadline}`, and the app substitutes the value the *user confirmed*.
 *
 * That turns CLAUDE.md §4 guardrail 3 — "never states a deadline that was not
 * extracted and confirmed" — from a rule that is checked afterwards into one
 * that is unreachable. A fabricated date is not merely rejected; there is no
 * path through the grammar that produces one.
 *
 * The remaining risk is the model writing a *wrong sentence* about a real date,
 * which no grammar can prevent. That is what the sanity pass in `explain.ts`
 * and the visible "read the original" affordance are for.
 * ---------------------------------------------------------------------------
 */

/** Placeholders the app fills from confirmed fields. Nothing else may appear. */
export const PLACEHOLDERS = ['{deadline}', '{program}', '{office}', '{hearingBy}'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * Four sections, fixed order, matching the headings on Notice Detail.
 *
 * The section labels are literals in the grammar rather than instructions in
 * the prompt, so the model cannot reorder them, rename them, add a fifth, or
 * skip one. Notice Detail renders four headings whatever happens, and this
 * guarantees there is something under each.
 */
export const EXPLANATION_GRAMMAR = `
root ::= says nl doing nl when nl appeal
says   ::= "SAYS: " sentence+ 
doing  ::= "DO: " sentence+
when   ::= "WHEN: " sentence+
appeal ::= "APPEAL: " sentence+

sentence ::= word (" " word)* punct " "?
word     ::= placeholder | plain
plain    ::= [A-Za-z]([A-Za-z'-])*
punct    ::= "." | "?"

# The only way to reach a number. The app substitutes a confirmed value.
placeholder ::= "{deadline}" | "{program}" | "{office}" | "{hearingBy}"

nl ::= "\\n"
`.trim();

/**
 * The prompt.
 *
 * Names the empty case explicitly, which the 2026-08-20 experiment showed is
 * necessary and not sufficient on its own — the grammar has to permit the
 * abstention too, and here it does, because a section can simply not mention a
 * placeholder.
 *
 * Guardrail 4 (never tell a user they are ineligible) is stated as a rule
 * rather than enforced by the grammar: "ineligible" is a sentence, not a token
 * pattern, so it is checked in the sanity pass instead of pretended away here.
 */
export function buildExplanationPrompt(facts: {
  program: string;
  office: string;
  actionType: string;
  hasDeadline: boolean;
  hasHearingDate: boolean;
  noticeText: string;
}): string {
  const available = [
    '{program}',
    '{office}',
    ...(facts.hasDeadline ? ['{deadline}'] : []),
    ...(facts.hasHearingDate ? ['{hearingBy}'] : []),
  ];

  return [
    'You are explaining a government benefits letter to someone who is worried and busy.',
    'Write at a sixth-grade reading level. Short sentences. No jargon.',
    '',
    'Write exactly four sections, in this order, each on its own line:',
    'SAYS: what the letter is telling them.',
    'DO: what they have to do. If nothing, say so.',
    'WHEN: by when. If the letter gives no date, say there is no date.',
    'APPEAL: how to disagree with the decision.',
    '',
    'RULES:',
    `- You may not write any number. Use only these placeholders: ${available.join(' ')}`,
    facts.hasDeadline
      ? '- Use {deadline} where the date belongs.'
      : '- There is NO deadline on this letter. Do not invent one. Say plainly that the letter gives no date to act by.',
    facts.hasHearingDate
      ? '- Use {hearingBy} for the date they must ask for a hearing by.'
      : '- There is no hearing date on this letter. Do not mention one.',
    '- Never say the reader is not eligible, or does not qualify. You cannot know that.',
    '- Only say things this letter says. Do not add advice it does not contain.',
    '',
    `The letter is a ${facts.actionType.replace(/_/g, ' ')} about ${facts.program}.`,
    '',
    'LETTER:',
    facts.noticeText.slice(0, 3000),
    '',
    'EXPLANATION:',
  ].join('\n');
}
