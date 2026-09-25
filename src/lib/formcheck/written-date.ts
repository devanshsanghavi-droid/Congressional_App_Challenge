/**
 * Reading a date someone wrote by hand, and the report month printed on a form.
 *
 * AUTHORSHIP: Claude. App-side, pure.
 *
 * The recogniser does read handwriting, and reads handwritten digits better than
 * handwritten words, but it confuses the usual suspects: a "1" read as "l" or
 * "I", a "0" as "O". Those are repaired inside a numeric token only, never across
 * a whole line. Whatever this returns is shown to the person for confirmation
 * before any rule is applied to it, because a misread "8" for "9" is exactly the
 * difference between "on time" and "sign it again".
 */

export interface CalendarDate {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
}

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

const MONTHS: readonly (readonly string[])[] = [
  ['JAN', 'JANUARY', 'ENE', 'ENERO'],
  ['FEB', 'FEBRUARY', 'FEBRERO'],
  ['MAR', 'MARCH', 'MARZO'],
  ['APR', 'APRIL', 'ABR', 'ABRIL'],
  ['MAY', 'MAYO'],
  ['JUN', 'JUNE', 'JUNIO'],
  ['JUL', 'JULY', 'JULIO'],
  ['AUG', 'AUGUST', 'AGO', 'AGOSTO'],
  ['SEP', 'SEPT', 'SEPTEMBER', 'SEPTIEMBRE', 'SETIEMBRE'],
  ['OCT', 'OCTOBER', 'OCTUBRE'],
  ['NOV', 'NOVEMBER', 'NOVIEMBRE'],
  ['DEC', 'DECEMBER', 'DIC', 'DICIEMBRE'],
];

function monthNumber(word: string): number | undefined {
  const w = word.toUpperCase().replace(/\./g, '');
  const index = MONTHS.findIndex((names) => names.includes(w));
  return index === -1 ? undefined : index + 1;
}

/** Repair recogniser confusions, but only inside something that is otherwise digits and separators. */
function repairDigits(token: string): string {
  if (!/^[0-9lIOo|/.\-]+$/.test(token) || !/[0-9]/.test(token)) return token;
  return token.replace(/[lI|]/g, '1').replace(/[Oo]/g, '0');
}

function valid(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 2000 || year > 2100) return false;
  return day <= new Date(year, month, 0).getDate();
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Parse a US-style written date: 9/2/2026, 09-02-26, 9.2.26, Sept 2 2026,
 * 2 Sept 2026. Undefined when nothing in `text` is a date.
 */
export function parseWrittenDate(text: string): CalendarDate | undefined {
  const tokens = text.split(/\s+/).map(repairDigits).join(' ');

  const numeric = /\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})\b/.exec(tokens);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = fullYear(Number(numeric[3]));
    if (valid(year, month, day)) return { year, month, day };
  }

  const monthFirst = /\b([A-Za-z]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})\b/.exec(tokens);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1] as string);
    const day = Number(monthFirst[2]);
    const year = fullYear(Number(monthFirst[3]));
    if (month !== undefined && valid(year, month, day)) return { year, month, day };
  }

  const dayFirst = /\b(\d{1,2})\s+(?:de\s+)?([A-Za-z]{3,10})\.?,?\s+(?:de\s+)?(\d{2}|\d{4})\b/.exec(tokens);
  if (dayFirst) {
    const month = monthNumber(dayFirst[2] as string);
    const day = Number(dayFirst[1]);
    const year = fullYear(Number(dayFirst[3]));
    if (month !== undefined && valid(year, month, day)) return { year, month, day };
  }
  return undefined;
}

/**
 * The report month printed after `label` somewhere in `text`: "Report Month:
 * AUGUST 2026". Undefined if the label or a month-and-year after it is missing.
 */
export function parseReportMonth(text: string, label: string): CalendarMonth | undefined {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toUpperCase().indexOf(label.toUpperCase());
  if (at === -1) return undefined;
  const after = flat.slice(at + label.length, at + label.length + 40);
  const found = /([A-Za-z]{3,10})\.?\s+(\d{4})/.exec(after);
  if (!found) return undefined;
  const month = monthNumber(found[1] as string);
  if (month === undefined) return undefined;
  return { year: Number(found[2]), month };
}

/** The last calendar day of a month. */
export function lastDayOf(month: CalendarMonth): CalendarDate {
  return { year: month.year, month: month.month, day: new Date(month.year, month.month, 0).getDate() };
}

/** Negative, zero or positive, like a sort comparator. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}
