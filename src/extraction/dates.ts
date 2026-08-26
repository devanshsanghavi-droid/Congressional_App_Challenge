/**
 * Dates: parsing, plausibility, and the labels that introduce them.
 *
 * Layer order for a date, strongest first (docs/CASCADE.md §1):
 *
 *   1. the label and the value are on the same printed line
 *   2. the value continues onto the *next* line, because the sentence wrapped
 *   3. the value is the label's spatial neighbour — same row to the right, or
 *      directly below at the same left edge
 *
 * Nothing below that. A date with no label near it is not a date this cascade
 * will claim, because the cost of the wrong deadline is a missed one.
 */

import { compareKey, tidy } from './text.ts';

const MONTHS_EN = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const MONTHS_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/**
 * Years Carta will believe without complaint.
 *
 * **Absolute, not relative to `nowMs`.** Deriving the window from the clock
 * would make the same page extract differently depending on when it was read,
 * and the contract suite asserts the opposite — moving `nowMs` a year must not
 * change a single field, or the corpus score stops being reproducible the day
 * after it is measured. So this is a claim about the world, defensible on its
 * own: a benefit notice is not from 1901 and not from 2200.
 */
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

/**
 * What a date string turned into.
 *
 * Three outcomes, not two, and the third is the point. `unreadable` means no
 * date was recognised. `implausible` means one *was* — a real reading of real
 * printed characters — that fails a check a human would also fail it on. Those
 * are different situations for the user: absent prompts them to type it, wrong
 * prompts them to correct it, and only the second can be corrected by someone
 * holding the paper.
 */
export type DateReading =
  | { readonly kind: 'ok'; readonly iso: string }
  | { readonly kind: 'implausible'; readonly iso: string }
  | { readonly kind: 'unreadable' };

const pad = (n: number): string => String(n).padStart(2, '0');

/** Is this a day that exists? September 31 is not, and neither is February 30. */
function isRealDay(year: number, monthIndex: number, day: number): boolean {
  // The Date constructor rolls a bad day forward — 31 September becomes
  // 1 October — so comparing the components back out is what detects it.
  // Checking `day <= 31` does not, for exactly that reason.
  const date = new Date(year, monthIndex, day);
  return (
    date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day
  );
}

function assemble(year: number, monthIndex: number, day: number): DateReading {
  const iso = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  if (!isRealDay(year, monthIndex, day)) return { kind: 'implausible', iso };
  if (year < YEAR_MIN || year > YEAR_MAX) return { kind: 'implausible', iso };
  return { kind: 'ok', iso };
}

/**
 * `"SEPTEMBER 8, 2026"` or `"5 DE SEPTIEMBRE DE 2026"` -> a reading.
 *
 * Month names are matched **in full**, never by prefix. Prefix matching would
 * let `SEPTEMBURR` — a real OCR misread from this corpus — become September, and
 * a garbled month that yields a confident date is strictly worse than one that
 * yields nothing. The abbreviated forms that a prefix match would have bought
 * (`Sep 5, 2026`) are handled by listing them, so the set stays closed.
 */
export function parseDate(raw: string): DateReading {
  const s = compareKey(raw);

  const en = /^([A-Z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (en) {
    const month = monthIndex(en[1] ?? '');
    if (month >= 0) return assemble(Number(en[3]), month, Number(en[2]));
    return { kind: 'unreadable' };
  }

  // Spanish prints "5 DE SEPTIEMBRE DE 2026", and this corpus prints it in
  // capitals — the accent-folded key makes the case irrelevant either way.
  const es = /^(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/.exec(s);
  if (es) {
    const month = monthIndex(es[2] ?? '');
    if (month >= 0) return assemble(Number(es[3]), month, Number(es[1]));
    return { kind: 'unreadable' };
  }

  return { kind: 'unreadable' };
}

/** Full names first, then the abbreviations actually seen in print. */
function monthIndex(word: string): number {
  const full = MONTHS_EN.indexOf(word);
  if (full >= 0) return full;
  const spanish = MONTHS_ES.indexOf(word);
  if (spanish >= 0) return spanish;
  const abbreviated = MONTHS_EN.findIndex((m) => m.slice(0, 3) === word && word.length === 3);
  if (abbreviated >= 0) return abbreviated;
  // "SEPT" is the one four-letter abbreviation in common use that is not a
  // three-letter prefix of anything else.
  if (word === 'SEPT') return 8;
  return -1;
}

/**
 * Anything date-shaped, for pulling a candidate out of a longer sentence.
 *
 * Constructed fresh on every call rather than shared. A module-level regex with
 * `/g` carries `lastIndex` between calls and produces intermittent misses that
 * depend on the order pages were read — one of the hardest bugs in this style of
 * code to see, because it looks like bad data.
 */
export function dateShaped(): RegExp {
  return /([A-Za-zÀ-ÿ]{3,}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[Dd][Ee]\s+[A-Za-zÀ-ÿ]+\s+[Dd][Ee]\s+\d{4})/;
}

/**
 * A date whose year was cut off by a line break.
 *
 * Measured on notice 05: the recogniser returns
 * `"...If you ask for a hearing before September 28,"` and puts `2026` at the
 * start of the next line. Notice 07 keeps the same sentence intact, so this is
 * a genuine per-page difference rather than a property of the form, and a
 * single-line regex silently loses the aid-paid-pending date on one of them.
 */
export function trailingPartialDate(text: string): string | undefined {
  const partial = /([A-Za-zÀ-ÿ]{3,}\.?\s+\d{1,2},)\s*$/.exec(tidy(text));
  return partial?.[1];
}

/** The leading year of a continuation line, if it opens with one. */
export function leadingYear(text: string): string | undefined {
  return /^\s*(\d{4})\b/.exec(text)?.[1];
}
