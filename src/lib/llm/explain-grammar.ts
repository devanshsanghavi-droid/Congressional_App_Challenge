/**
 * The grammar for the plain-language explanation.
 *
 * AUTHORSHIP: Claude. App-side. Distinct from the extraction grammar, which is
 * Devansh's and lives in `/src/extraction` (CLAUDE.md §15) — this constrains
 * *prose*, not a schema.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN, AND THE TWO IT REPLACES
 * ---------------------------------------------------------------------------
 * This grammar is the third answer to one question: how do you stop a 1.5B
 * model putting a date in front of a user that the user never confirmed? The
 * first two were measured and both failed. The full arc, with numbers, is in
 * NOTES.md (2026-08-20 and 2026-08-24); the short version is what it takes to
 * understand why this file looks so plain.
 *
 * **First answer — constrain the shape of a date.** `\d{2}/\d{2}/\d{4}`. It
 * accepted `00/00/0001`, and worse, a grammar with no production meaning "not
 * stated" left the sampler no legal way to abstain, so on a notice with no
 * deadline the model emitted the notice date instead. **A grammar with no null
 * production converts every gap into a confident fabrication.**
 *
 * **Second answer — forbid digits outright.** `char ::= [^0-9{}]`, with
 * `{deadline}`-style placeholders as the only route to a number and the app
 * substituting confirmed values. Measured over all ten corpus notices it was
 * airtight and useless:
 *
 *   - zero digits emitted, on all ten. The ban worked perfectly.
 *   - **zero placeholders emitted, on all ten.** The model never once chose
 *     `{deadline}` over prose, so the substitution the whole guardrail rested
 *     on never fired. Not on any notice.
 *   - 8 of 10 withheld as `incomplete`: reaching a number it could not write,
 *     the sampler took the highest-probability legal token, which put it in a
 *     state where that token was again most likely, and it burned the whole
 *     budget there — "…before February oubt oubt oubt" ×83.
 *   - the 2 that *passed* the sanity pass were the dangerous ones. Forbidden
 *     digits, the model wrote numbers as letters: **"renew your Medi-Cal
 *     coverage by October XXX XXX"** and **"ask for a hearing by calling
 *     XXX-XXX-XXXX"**, both shown to the user, because `\d+` cannot see `XXX`.
 *
 * ---------------------------------------------------------------------------
 * THE THIRD ANSWER: DON'T ASK IT FOR THE NUMBER
 * ---------------------------------------------------------------------------
 * Both failures came from the same mistake — asking the model to produce a
 * value the app already had, and then policing the answer. The deadline is not
 * something the model knows. It was extracted, and the user confirmed it on
 * Review. The app can simply render it.
 *
 * So the explanation **has no "by when" section at all**. Notice Detail renders
 * that date directly from the confirmed field, above this text, and always did.
 * The model writes the three sections it can actually contribute to:
 *
 *     SAYS   — what the letter is telling them
 *     DO     — what they have to do
 *     APPEAL — how to disagree
 *
 * Digits are allowed. There is no placeholder machinery, no substitution step,
 * and nothing to leave unfilled. The model can write "within 10 days", "$412",
 * "90 days" — ordinary sentences with numbers in them, which is what it could
 * never do before and what it kept degenerating trying to avoid.
 *
 * **The grammar is now a shape, not a filter.** It guarantees three labelled
 * sections in a fixed order so Notice Detail always has something under each
 * heading. It makes no claim about truth, and this file should never grow one
 * again — that is `explain-check.ts`'s job, and it is a *net*, not a mechanism.
 */

/**
 * Three sections, fixed order, matching the headings on Notice Detail.
 *
 * The labels are literals in the grammar rather than instructions in the
 * prompt, so the model cannot reorder them, rename them, add a fourth, or skip
 * one. Everything else about a sentence is unconstrained: this grammar's only
 * job is that the four headings on the screen are never rendered empty.
 *
 * Note there is no `when` production. Its absence is the design.
 *
 * **`line` is bounded, and that bound is load-bearing.** The first version of
 * this grammar had `line ::= char+`, unbounded, and it withheld 6 of 10 notices
 * as `incomplete` — not because anything was wrong with the prose but because
 * the model spent the whole token budget on `SAYS` and never reached `APPEAL`.
 * Notice 10 wrote 600 correct characters and then repeated itself three times.
 * Bounding in **sentences** rather than characters is deliberate: a character
 * cap cuts mid-word and the next section reads as a continuation of the last
 * one ("DO: Date, which is September 5, 2026. This means that the letter"),
 * measured on this build at `char{1,60}`. Ending only at a full stop cannot do
 * that.
 *
 * Three sentences of 180 characters is also the shape the prompt asks for —
 * "short sentences", sixth-grade — so the grammar and the instruction agree
 * instead of pulling against each other.
 *
 * Every rule is on one line: this llama.cpp build treats a newline as the end
 * of a rule, so a wrapped one silently truncates (CLAUDE.md §13).
 */
export const EXPLANATION_GRAMMAR = `
root ::= says nl doing nl appeal
says ::= "SAYS: " line
doing ::= "DO: " line
appeal ::= "APPEAL: " line
line ::= sentence (" " sentence){0,2}
sentence ::= schar{1,180} punct
schar ::= [^\\n.?!]
punct ::= "." | "?"
nl ::= "\\n"
`.trim();

/**
 * The prompt.
 *
 * Shorter than the version it replaces, because most of that one was rules
 * about how to avoid writing a number. Those are gone with the ban.
 *
 * Two rules remain, and both are about *meaning* rather than form, which is
 * why neither is in the grammar: a grammar cannot express "do not tell someone
 * they are ineligible" — that is a sentence, not a token pattern — and it
 * cannot express "do not state a date the user has not confirmed", because
 * every date is a legal token sequence. Both are checked afterwards, in
 * `explain-check.ts`, on the finished text.
 */
export function buildExplanationPrompt(facts: {
  program: string;
  office: string;
  actionType: string;
  /**
   * The confirmed deadline, rendered the way the screen shows it, or undefined.
   *
   * Passed so the model can *refer* to a date it is told, not so it can invent
   * one. Notice Detail renders this value itself, above the explanation; if the
   * model repeats it the sanity pass will find it in the confirmed set and let
   * it through, and if it writes any other date the explanation is withheld.
   */
  deadline?: string;
  hearingBy?: string;
  noticeText: string;
}): string {
  const dates: string[] = [];
  if (facts.deadline !== undefined) dates.push(`The date they must act by is ${facts.deadline}.`);
  if (facts.hearingBy !== undefined) {
    dates.push(`To keep benefits during an appeal they must ask by ${facts.hearingBy}.`);
  }

  return [
    'You are explaining a government benefits letter to someone who is worried and busy.',
    'Write at a sixth-grade reading level. Short sentences. No jargon.',
    '',
    'Write exactly three sections, in this order, each on its own line:',
    'SAYS: what the letter is telling them.',
    'DO: what they have to do. If nothing, say so.',
    'APPEAL: how to disagree with the decision.',
    '',
    'RULES:',
    // The one rule about numbers, and it is a rule about *sources*, not digits.
    '- Only use dates and amounts that appear in the letter below. Do not calculate a date.',
    '- Never say the reader is not eligible, or does not qualify. You cannot know that.',
    '- Only say things this letter says. Do not add advice it does not contain.',
    ...(dates.length === 0
      ? ['- This letter gives no date to act by. Do not invent one.']
      : dates.map((line) => `- ${line}`)),
    '',
    `The letter is a ${facts.actionType.replace(/_/g, ' ')} about ${facts.program}, from ${facts.office}.`,
    '',
    'LETTER:',
    facts.noticeText.slice(0, 3000),
    '',
    'EXPLANATION:',
  ].join('\n');
}

/** One turn of a chat, in the shape `llama.rn` expects. */
export interface ChatTurn {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * The explanation prompt as **chat turns**, which is what the model was trained on.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS REPLACED THE FLAT STRING
 * ---------------------------------------------------------------------------
 * Measured on the phone, 2026-08-28. `buildExplanationPrompt` produced one
 * undifferentiated block — role, section descriptions, rules, then the letter,
 * then a bare `EXPLANATION:` — and the model **echoed the instruction template
 * back verbatim**, `RULES:` included, without ever reading the letter:
 *
 *     SAYS: What the letter is telling them.
 *     DO: What they have to do. If nothing, say so.
 *     APPEAL: How to disagree with the decision. RULES: Only use dates...
 *
 * That is not a capability failure. Qwen2.5-Instruct is trained on ChatML, and
 * handed a flat block it does what a base model does: continues the most recent
 * pattern it can see. The most recent pattern was a list of labelled sections,
 * so it produced more labelled sections. It was completing, not answering.
 *
 * Split into turns, each carrying one job:
 *
 *   - **system** — who it is, the three sections, the rules. Instructions the
 *     model must follow but must never reproduce.
 *   - **user** — the letter, and nothing else. Content to be acted on.
 *   - **assistant** — opened empty by `add_generation_prompt`, so generation
 *     begins where an answer belongs rather than after a colon.
 *
 * The separation is the fix. In a flat string "explain this letter" and the
 * letter are the same kind of text and the model cannot tell them apart; the
 * chat template marks them with the special tokens the model was trained to
 * read, and instruction stops looking like content.
 *
 * **`llama.rn` applies the template itself** from the GGUF metadata — the
 * `messages` parameter with `add_generation_prompt` — so nothing here
 * hand-rolls `<|im_start|>`. Hard-coding those tokens would mean this file
 * silently produced the wrong format the day the model changed.
 */
export function buildExplanationTurns(facts: {
  program: string;
  office: string;
  actionType: string;
  deadline?: string;
  hearingBy?: string;
  noticeText: string;
}): ChatTurn[] {
  const dates: string[] = [];
  if (facts.deadline !== undefined) dates.push(`The date they must act by is ${facts.deadline}.`);
  if (facts.hearingBy !== undefined) {
    dates.push(`To keep benefits during an appeal they must ask by ${facts.hearingBy}.`);
  }

  const system = [
    'You explain government benefits letters to someone who is worried and busy.',
    'Write at a sixth-grade reading level. Short sentences. No jargon.',
    '',
    'Answer with exactly three sections, in this order, each on its own line:',
    'SAYS: what this letter is telling them.',
    'DO: what they have to do. If nothing, say so.',
    'APPEAL: how to disagree with the decision.',
    '',
    'Rules:',
    '- Only use dates and amounts that appear in the letter. Do not calculate a date.',
    '- Never say the reader is not eligible, or does not qualify. You cannot know that.',
    '- Only say things the letter says. Do not add advice it does not contain.',
    // Written as an instruction about the answer rather than a heading, because
    // a heading is the shape the model copied last time.
    '- Write about this specific letter. Never repeat these instructions back.',
    ...(dates.length === 0
      ? ['- This letter gives no date to act by. Do not invent one.']
      : dates.map((line) => `- ${line}`)),
    '',
    'Reply in the same language as the letter.',
  ].join('\n');

  const user = [
    `This is a ${facts.actionType.replace(/_/g, ' ')} about ${facts.program}, from ${facts.office}.`,
    '',
    facts.noticeText.slice(0, 3000),
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
