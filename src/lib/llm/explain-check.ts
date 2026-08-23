/**
 * The sanity pass over a generated explanation.
 *
 * AUTHORSHIP: Claude. App-side, and pure — no imports, so it is tested in bare
 * Node without a model.
 *
 * The grammar makes a fabricated date unreachable (see `explain-grammar.ts`).
 * It cannot make a *false sentence* unreachable, because "you are not eligible"
 * is ordinary English. So the guardrails that are about meaning rather than
 * form are checked here, on the finished text, before it is ever shown.
 *
 * CLAUDE.md §4 lists five guardrails. Two are UI (the original one tap away,
 * the machine-generated label). Three are checkable and are checked here.
 */

export type ExplanationProblem =
  /** Guardrail 3: a date the user never confirmed. */
  | 'unconfirmed-number'
  /** Guardrail 4: told the reader they do not qualify. */
  | 'eligibility-claim'
  /** A placeholder the app has no value for, left in the visible text. */
  | 'unfilled-placeholder';

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
 * Check a finished explanation, after placeholder substitution.
 *
 * `confirmedValues` is every string the user confirmed on Review, rendered the
 * way it appears in the text. A number in the explanation that is not in that
 * set did not come from the letter, and the explanation is withheld.
 */
export function checkExplanation(
  text: string,
  confirmedValues: readonly string[],
): CheckResult {
  const problems = new Set<ExplanationProblem>();

  for (const pattern of ELIGIBILITY_CLAIMS) {
    if (pattern.test(text)) problems.add('eligibility-claim');
  }

  if (/\{[a-zA-Z]+\}/.test(text)) problems.add('unfilled-placeholder');

  // Every run of digits in the visible text must be traceable to something the
  // user confirmed. The grammar forbids the model emitting digits at all, so
  // anything here arrived through substitution — and this catches a
  // substitution bug as surely as it would catch a fabrication.
  const confirmed = confirmedValues.join(' ');
  // Separators only BETWEEN digits. An earlier version used `\d[\d,./-]*`,
  // which swallowed the full stop at the end of a sentence — "2026." then
  // failed to match the confirmed "2026" and every explanation ending in a
  // date was withheld.
  for (const match of text.matchAll(/\d+(?:[,./-]\d+)*/g)) {
    if (!confirmed.includes(match[0])) problems.add('unconfirmed-number');
  }

  return { ok: problems.size === 0, problems: [...problems] };
}

export interface ExplanationSections {
  readonly says: string;
  readonly doing: string;
  readonly when: string;
  readonly appeal: string;
}

/**
 * Split the model's four labelled lines into sections.
 *
 * Returns undefined if any section is missing. The grammar makes that
 * near-impossible, but "near-impossible" is not a reason to render undefined
 * into a screen — a partial explanation is exactly the kind of stub CLAUDE.md
 * §10 says to cut rather than ship.
 */
export function parseSections(raw: string): ExplanationSections | undefined {
  const grab = (label: string): string | undefined => {
    const match = new RegExp(`${label}:\\s*([^\\n]*)`, 'i').exec(raw);
    const value = match?.[1]?.trim();
    return value === undefined || value === '' ? undefined : value;
  };
  const says = grab('SAYS');
  const doing = grab('DO');
  const when = grab('WHEN');
  const appeal = grab('APPEAL');
  if (!says || !doing || !when || !appeal) return undefined;
  return { says, doing, when, appeal };
}

/** Fill the placeholders the grammar allows from confirmed values only. */
export function substitute(
  text: string,
  values: Readonly<Record<string, string | undefined>>,
): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => values[key] ?? whole);
}
