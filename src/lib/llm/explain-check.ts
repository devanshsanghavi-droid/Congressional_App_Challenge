/**
 * The sanity pass over a generated explanation.
 *
 * AUTHORSHIP: Claude. App-side, and pure — no imports, so it is tested in bare
 * Node without a model.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A NET, NOT THE MECHANISM
 * ---------------------------------------------------------------------------
 * It used to be the mechanism's backstop: the grammar forbade digits, so a
 * fabricated date was supposed to be unreachable and this only had to catch
 * what form could not express. That was measured on 2026-08-24 and it was
 * exactly backwards — the ban made the model write numbers as *letters*, and
 * this file's digit check could not see them. "renew your Medi-Cal coverage by
 * October XXX XXX" passed every test here and was shown to a user.
 *
 * The ban is gone (see `explain-grammar.ts`). The model writes digits freely
 * now, and this is the only thing standing between it and the screen. So it is
 * built on the assumption that the text is *unconstrained and possibly wrong*,
 * and it fails closed: anything it cannot account for withholds the whole
 * explanation rather than annotating it.
 *
 * CLAUDE.md §4 lists five guardrails. Two are UI (the original one tap away,
 * the machine-generated label). Three are about meaning and are checked here.
 */

export type ExplanationProblem =
  /** Guardrail 3: a date the user never confirmed. */
  | 'unconfirmed-date'
  /** A number written as letters — `XXX`, `xx/xx` — to dodge a digit check. */
  | 'letter-number'
  /** Guardrail 4: told the reader they do not qualify. */
  | 'eligibility-claim';

export interface CheckResult {
  readonly ok: boolean;
  readonly problems: readonly ExplanationProblem[];
}

/**
 * Phrases that decide eligibility. Carta does not screen for eligibility
 * (SPEC §10) and must never tell someone they do not qualify — the single
 * worst thing this app could say, because a person who is in fact eligible
 * might believe it and stop.
 */
const ELIGIBILITY_CLAIMS: readonly RegExp[] = [
  /\bnot eligible\b/i,
  /\bineligible\b/i,
  /\bdo(?:es)? not qualify\b/i,
  /\bno longer qualify\b/i,
  /\byou (?:are|were) denied\b/i,
  /\bno elegible\b/i,
  /\bno califica\b/i,
];

/**
 * Anything that occupies the position of a number without being one.
 *
 * Added 2026-08-24 from a real failure, and kept after the digit ban was
 * removed because it costs nothing and the failure mode is not hypothetical:
 * a model that cannot or will not commit to a value writes a placeholder-shaped
 * token instead, and "October XXX XXX" reads to a hurried person as a real date
 * they simply cannot make out. Three or more X's, an `XX/XX` shape, or a masked
 * phone number, in any case.
 */
const LETTER_NUMBERS: readonly RegExp[] = [
  /\b[Xx]{3,}\b/,
  /\b[Xx]{2,}\s*[/-]\s*[Xx]{2,}/,
  /\b[Xx]{2,}\b(?=\s*(?:,|\.|$|\s+\d{4}))/,
  /\b(?:NN+|nn+)\b/,
  // No `\b` around these: `#` and `?` are not word characters, so a word
  // boundary before them asserts the *opposite* of what it looks like and the
  // pattern never fires. Caught by a test, not by reading it.
  /#{3,}/,
  /\?{3,}/,
];

/**
 * Every date shape the model might write, so each one can be checked against
 * what the user confirmed.
 *
 * Deliberately generous — a pattern that misses a date shape is a fabricated
 * date reaching a screen, whereas a pattern that over-matches only withholds an
 * explanation that could have been shown. Those costs are not symmetric.
 */
const MONTH_NAME =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december' +
  '|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec' +
  '|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';

const DATE_SHAPES: readonly RegExp[] = [
  // September 5, 2026 · Sept 5 2026
  new RegExp(`\\b${MONTH_NAME}\\b[^.,;:!?]{0,20}?\\b\\d{1,4}\\b`, 'gi'),
  // 5 September 2026 · 30 de septiembre de 2026 — the number leads in Spanish
  // and in much of the world, and matching only the English order let
  // "30 de septiembre de 2026" through as if it carried no date at all.
  new RegExp(`\\b\\d{1,4}\\b[^.,;:!?]{0,10}?\\b${MONTH_NAME}\\b(?:[^.,;:!?]{0,10}?\\b\\d{2,4}\\b)?`, 'gi'),
  // 09/05/2026 · 2026-09-05 · 5-9-26
  /\b\d{1,4}[/-]\d{1,2}[/-]\d{2,4}\b/g,
];

/**
 * Normalise for comparison: case, punctuation and whitespace are noise here.
 * "September 5, 2026" and "september 5 2026" are the same claim.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Month names, English and Spanish, to their number.
 *
 * Without this a confirmed "Saturday, September 5, 2026" and a generated
 * "2026-09-05" share only `{2026, 5}` — the `9` exists in one as a word and in
 * the other as a digit — so the app's own confirmed date would be rejected as
 * unconfirmed. The first version of this file did exactly that.
 */
const MONTHS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, enero: 1,
  february: 2, feb: 2, febrero: 2,
  march: 3, mar: 3, marzo: 3,
  april: 4, apr: 4, abril: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7,
  august: 8, aug: 8, agosto: 8,
  september: 9, sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  october: 10, oct: 10, octubre: 10,
  november: 11, nov: 11, noviembre: 11,
  december: 12, dec: 12, diciembre: 12,
};

/**
 * The numbers a date carries, with month names resolved and leading zeros
 * dropped. `2026-09-05` and `September 5, 2026` both give `{2026, 9, 5}`.
 */
function digitsOf(text: string): string[] {
  const numbers = (text.match(/\d+/g) ?? []).map((n) => String(Number(n)));
  for (const word of text.toLowerCase().match(/[a-záéíóúñ]+/g) ?? []) {
    const month = MONTHS[word];
    if (month !== undefined) numbers.push(String(month));
  }
  return numbers;
}

/**
 * Is this date one the user confirmed?
 *
 * True when the confirmed set contains a date whose numbers are a superset of
 * this one's. That lets the model write "September 5" for a confirmed
 * "Saturday, September 5, 2026" — a real abbreviation of a real value — while
 * still rejecting "September 30", whose `30` appears in no confirmed date.
 */
function isConfirmed(candidate: string, confirmed: readonly string[]): boolean {
  const found = normalise(candidate);
  const parts = digitsOf(candidate);

  return confirmed.some((value) => {
    const whole = normalise(value);
    if (whole.includes(found) || found.includes(whole)) return true;
    if (parts.length === 0) return false;
    const known = new Set(digitsOf(value));
    return parts.every((part) => known.has(part));
  });
}

/**
 * Check a finished explanation.
 *
 * `confirmedValues` is every date the user confirmed on Review, rendered the
 * way it appears on the screen. A date in the explanation that cannot be
 * traced to one of them did not come from a value this user checked, and the
 * explanation is withheld — whether the model read it off the letter, inferred
 * it, or invented it. Carta cannot tell those apart, and the guardrail is about
 * what the *user confirmed*, not about the model's intent.
 */
export function checkExplanation(
  text: string,
  confirmedValues: readonly string[],
): CheckResult {
  const problems = new Set<ExplanationProblem>();

  for (const pattern of ELIGIBILITY_CLAIMS) {
    if (pattern.test(text)) problems.add('eligibility-claim');
  }

  for (const pattern of LETTER_NUMBERS) {
    if (pattern.test(text)) problems.add('letter-number');
  }

  for (const shape of DATE_SHAPES) {
    // `matchAll` needs the global flag and a fresh lastIndex; these literals
    // are module-level and would otherwise carry state between calls.
    shape.lastIndex = 0;
    for (const match of text.matchAll(shape)) {
      if (!isConfirmed(match[0], confirmedValues)) problems.add('unconfirmed-date');
    }
  }

  return { ok: problems.size === 0, problems: [...problems] };
}

/**
 * The three sections the model writes.
 *
 * There is no `when`. Notice Detail renders the deadline itself, from the
 * confirmed field, above this text — see `explain-grammar.ts` for why that is
 * the whole point rather than an omission.
 */
export interface ExplanationSections {
  readonly says: string;
  readonly doing: string;
  readonly appeal: string;
}

/**
 * Split the model's three labelled lines into sections.
 *
 * Returns undefined if any section is missing. The grammar makes that
 * near-impossible, but "near-impossible" is not a reason to render undefined
 * into a screen — a partial explanation is exactly the kind of stub CLAUDE.md
 * §10 says to cut rather than ship. Under the old digit ban this fired on 8 of
 * 10 notices, which is how the degeneration loops were caught.
 */
export function parseSections(raw: string): ExplanationSections | undefined {
  const grab = (label: string): string | undefined => {
    // `[ \t]*`, never `\\s*`: `\\s` includes the newline, so an empty section
    // consumed the line break and captured the FOLLOWING section's text —
    // `DO:` with nothing after it returned "APPEAL: Call." as the DO section
    // and reported the explanation complete. Caught by a test.
    const match = new RegExp(`${label}:[ \\t]*([^\\n]*)`, 'i').exec(raw);
    const value = match?.[1]?.trim();
    return value === undefined || value === '' ? undefined : value;
  };
  const says = grab('SAYS');
  const doing = grab('DO');
  const appeal = grab('APPEAL');
  if (!says || !doing || !appeal) return undefined;
  return { says, doing, appeal };
}
