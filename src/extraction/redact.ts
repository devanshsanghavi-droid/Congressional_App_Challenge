/**
 * The redaction matcher — a write gate, not a display filter.
 *
 * CLAUDE.md §3 rule 5: **never persist an SSN.** `saveNotice()` throws if it is
 * handed OCR text with `redacted: false`, and that refusal is the last thing
 * standing between a recognised Social Security number and the database.
 *
 * The flag has already been wrong once, in the direction that matters:
 * `scaffold.ts` returned `redacted: true` from fc33506 until 2026-08-26 while
 * having no matcher at all. A guard that takes the guarded party's word for it
 * is a request, not a guard — so this module's only job is to make the word
 * true.
 *
 * ---------------------------------------------------------------------------
 * WHY IT REDACTS RATHER THAN REFUSES
 * ---------------------------------------------------------------------------
 * The alternative design — find an SSN, refuse to return any text — protects the
 * database and destroys the notice. Every downstream feature reads the OCR text:
 * the plain-language explanation, "view original", the checklist. Removing nine
 * digits keeps all of that and loses nothing the user needs, because the one
 * thing they must never be shown back is the number itself.
 */

/**
 * The shapes an SSN takes in print and after OCR.
 *
 * Ordered longest-context first so that a labelled number is consumed with its
 * label rather than leaving `SSN:` dangling in the text.
 *
 * Two OCR realities are built in. The separator may be a hyphen, an en dash, a
 * non-breaking hyphen or a space, because recognisers substitute freely among
 * them. And the digits may already be partly masked on the printed page —
 * `XXX-XX-6789` is how a county prints it — which still must not be stored,
 * because the last four plus a name and an address is not anonymous.
 */
const SEP = '[\\s\\u002d\\u2010\\u2011\\u2012\\u2013\\u2014\\u00ad]?';
const D = '[0-9Xx]';

const SSN_PATTERNS: readonly RegExp[] = [
  // Labelled, English and Spanish, with or without separators.
  new RegExp(
    `(?:SSN|S\\.S\\.N|Social\\s+Security\\s+(?:Number|No\\.?|#)|` +
      `N[uú]mero\\s+de\\s+Seguro\\s+Social|Seguro\\s+Social)` +
      `\\s*[:#]?\\s*${D}{3}${SEP}${D}{2}${SEP}${D}{4}`,
    'gi',
  ),
  // Unlabelled but separated — 123-45-6789, 123 45 6789, XXX-XX-6789.
  new RegExp(`\\b${D}{3}[\\u002d\\u2010\\u2011\\u2012\\u2013\\u2014\\u00ad\\s]${D}{2}[\\u002d\\u2010\\u2011\\u2012\\u2013\\u2014\\u00ad\\s]${D}{4}\\b`, 'g'),
  // Nine bare digits. Deliberately last and deliberately narrow: a bare
  // \d{9} also matches a case number with the dashes dropped by OCR, so it
  // only fires when the run is exactly nine long and stands alone.
  /\b[0-9]{9}\b/g,
];

export interface Redaction {
  /** The text with every match replaced. Safe to persist. */
  readonly text: string;
  /** True when at least one pattern matched. */
  readonly containedSsn: boolean;
}

/** What replaces a match. Fixed width so the line does not reflow. */
const MASK = '[SSN REMOVED]';

/**
 * Remove every SSN-shaped run from `text`.
 *
 * Always returns text — there is no failure mode where the caller is left
 * guessing whether it ran, because the caller sets `redacted: true` on the
 * strength of having called it.
 */
export function redact(text: string): Redaction {
  let out = text;
  let found = false;
  for (const pattern of SSN_PATTERNS) {
    // Fresh regex per pass: these carry /g, and a shared instance would keep
    // `lastIndex` between documents and skip matches depending on what was
    // read before it.
    const fresh = new RegExp(pattern.source, pattern.flags);
    if (fresh.test(out)) {
      found = true;
      out = out.replace(new RegExp(pattern.source, pattern.flags), MASK);
    }
  }
  return { text: out, containedSsn: found };
}

/**
 * Does this line contain an SSN? Used to keep a redacted line from being
 * offered as a *value* — a name search must never return "[SSN REMOVED]".
 */
export function looksRedacted(text: string): boolean {
  return text.includes(MASK);
}
