/**
 * The recipient's name, and the case number.
 *
 * The name has no label. There is no `Recipient:` on any of these forms — it is
 * simply the top line of the address block, which makes finding it structural
 * rather than lexical, and makes it the field that fails most.
 *
 * ---------------------------------------------------------------------------
 * THE TARGET IS "EMPTY OR RIGHT", NEVER "WRONG"
 * ---------------------------------------------------------------------------
 * `FIELD_RISK` already marks `recipientName` high, `fieldNeedingAttention`
 * already opens Review focused on it, and **nothing is ever scheduled from it**.
 * The app was built assuming this field arrives wrong. So every rule below is
 * written to fail closed: when the walk is not confident, it returns nothing,
 * because a blank costs the user a typing prompt and a plausible wrong name is
 * what a tired person taps past.
 */

import { compareKey, fold, tidy } from './text.ts';
import { looksRedacted } from './redact.ts';
import type { Found } from './geometry.ts';
import type { OcrLine } from './types.ts';

/** ", CA 95122" — the most distinctive shape in an address block. */
const CITY_LINE = /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/;

/** A street line: a house number, then something. */
const STREET_LINE = /^\d+\s+\S/;

/**
 * Words that mean this line is an organisation, not a person.
 *
 * This is the guard that shape cannot provide. `SOCIAL SERVICES AGENCY` is
 * upper-case, twenty-two characters, letters and spaces — it satisfies every
 * name-shaped test that can be written, and on a notice where the agency's own
 * return address is printed above the recipient's it is exactly what an
 * address-block walk returns.
 *
 * Matched against the folded, upper-cased line, so accents and case do not
 * matter.
 */
const NOT_A_PERSON =
  /\b(AGENCY|AGENCIA|DEPARTMENT|DEPARTAMENTO|COUNTY|CONDADO|STATE OF|DIVISION|BUREAU|OFFICE|OFICINA|SERVICES|SERVICIOS|ADMINISTRATION|NOTICE|AVISO|SECTION|SECCION|PO BOX|P\.O\.)\b/;

/**
 * Does this read like a person's name?
 *
 * Tested against the **folded** copy so `JOSÉ MARTÍNEZ` and `Nguyễn Thị Lan`
 * reach the same test as `MARIA REYES`, while the value returned to the app is
 * always the original text — the user is checking it against the paper, and a
 * silently de-accented name is a name they cannot match.
 *
 * Deliberately permissive about case. Notices print names both ways and there is
 * no reading of "mixed case" that means "not a name".
 */
function looksLikeName(original: string): boolean {
  const line = tidy(original);
  if (line.length < 4 || line.length > 60) return false;
  if (looksRedacted(line)) return false;

  const key = compareKey(line);
  if (NOT_A_PERSON.test(key)) return false;
  // A name has no digits and no punctuation that belongs to a form field.
  if (/[0-9@#:_/\\|]/.test(key)) return false;
  // Letters, spaces, and the three marks that appear inside real names.
  if (!/^[A-Z][A-Z .'-]*$/.test(key)) return false;
  // At least two words: a lone surname is indistinguishable from a heading.
  return key.split(' ').filter((w) => w.length > 0).length >= 2;
}

/**
 * Find the recipient by walking up a column from the city line.
 *
 * Anchoring on the **left edge** rather than the line index is what survives OCR
 * reading order: on these notices the right-hand metadata column (`Case Number`,
 * `Worker ID`) is emitted *between* the address lines, so "two lines above the
 * city" is the street. Lines that share the city line's x are the address block
 * and nothing else.
 *
 * The street is the inner anchor because it has an unmistakable shape, and the
 * name is the line directly above it. Walking further up climbs into the
 * document title.
 *
 * **Every city line is tried, not just the first.** A notice that prints the
 * agency's own return address above the recipient's has two, and taking the
 * first one silently returns the agency. Candidates are filtered by
 * `looksLikeName`, which rejects organisations outright, so the agency block
 * contributes nothing and the recipient's block is still found.
 */
export function findRecipient(lines: readonly OcrLine[]): Found<string> | undefined {
  for (let cityIndex = 0; cityIndex < lines.length; cityIndex++) {
    const city = lines[cityIndex];
    if (!city || !CITY_LINE.test(tidy(city.text))) continue;

    const column: { index: number; line: OcrLine }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (Math.abs(line.box.x - city.box.x) >= 0.03) continue;
      if (line.box.y > city.box.y) continue;
      column.push({ index: i, line });
    }
    column.sort((a, b) => a.line.box.y - b.line.box.y);

    // The street belonging to THIS city line is the nearest street-shaped line
    // ABOVE it, not the first one on the page. Searching from the top finds the
    // agency's street on any notice that prints a return address above the
    // recipient's — the column contains both blocks — and the recipient's block
    // is then never reached at all. Found by the extension set, which was
    // written before this function existed.
    let street = -1;
    for (let k = column.length - 1; k >= 0; k--) {
      const entry = column[k];
      if (entry && STREET_LINE.test(tidy(entry.line.text))) {
        street = k;
        break;
      }
    }
    if (street <= 0) continue;
    const candidate = column[street - 1];
    if (!candidate) continue;
    if (!looksLikeName(candidate.line.text)) continue;

    return { value: tidy(candidate.line.text), lines: [candidate.index] };
  }
  return undefined;
}

/**
 * The case number, which unlike the name does have a label.
 *
 * Requires the colon and requires a digit in the value. Without both, the
 * pattern matches the prose "...or case numbers." and returns `s` — which the
 * app would then salt, hash, and show the user as the last four digits of their
 * case. That is not hypothetical; it is what the scaffold's looser pattern did
 * on a page built to contain no fields.
 */
export function findCaseNumber(lines: readonly OcrLine[]): Found<string> | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const match = /(?:Case\s*Number|N[uú]mero\s+del?\s+[Cc]aso)\s*[:#]\s*([A-Za-z0-9-]{4,})/i.exec(
      line.text,
    );
    const value = match?.[1];
    if (value === undefined) continue;
    if (!/\d/.test(value)) continue;
    return { value: fold(value).toUpperCase(), lines: [i] };
  }
  return undefined;
}
