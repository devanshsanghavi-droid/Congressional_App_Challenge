/**
 * The extraction cascade.
 *
 * An ordered list of strategies for finding one value, tried strongest first,
 * stopping at the first that works — see docs/CASCADE.md for the long form.
 * First-hit-wins rather than collect-and-score, because scoring is a confidence
 * model that has to be defended, and *the most reliable method that produced an
 * answer is the answer* defends itself in one sentence.
 *
 * Pure. No I/O, no globals, no clock of its own: everything arrives as an
 * argument, which is what lets this run unchanged on the phone and in bare Node
 * against the corpus (CLAUDE.md §8).
 *
 * ---------------------------------------------------------------------------
 * THE RULE THE WHOLE FILE IS BUILT AROUND
 * ---------------------------------------------------------------------------
 * **An absent field is `undefined`, never a guess.** For a deadline app a
 * missing value costs the user a typing prompt; a wrong value silently schedules
 * the wrong day. There is no fallback anywhere below that fills a field to avoid
 * returning nothing, and adding one would be the single most damaging change
 * that could be made to this file.
 *
 * A value that was found but fails a check is a third case, and it is not the
 * same as absent: it comes back **with `invalid` set**, so Review can show it,
 * mark it, and open focused on it. Someone holding the paper can fix a wrong
 * date in one tap; they cannot fix a blank they were never shown.
 */

import { dateShaped, leadingYear, parseDate, trailingPartialDate } from './dates.ts';
import type { DateReading } from './dates.ts';
import { valueIndexFor } from './geometry.ts';
import type { Found } from './geometry.ts';
import {
  ACTIONS,
  AGENCIES,
  allMatches,
  DOC_LEXICON,
  firstMatch,
  foldPage,
  FORM_IDS,
  PROGRAMS,
} from './identity.ts';
import { findCaseNumber, findRecipient } from './name.ts';
import { redact } from './redact.ts';
import { tidy } from './text.ts';
import type {
  ExtractedField,
  ExtractedNotice,
  ExtractionInput,
  ExtractionResult,
  OcrLine,
} from './types.ts';

/**
 * Labels that introduce each date, in priority order.
 *
 * Labels are the outer loop and lines the inner one, which is what makes this a
 * priority list rather than a set: `SUBMIT BY` is tried against every line on the
 * page before `APPOINTMENT` is tried against any. A weak label somewhere must
 * never beat a strong label elsewhere.
 *
 * Drawn from notices 01–07 only. Spanish is not a translation of the English
 * list — `FECHA LIMITE` and `Fecha del Aviso` are what these forms actually
 * print, in capitals, which the folded comparison makes case-irrelevant.
 */
const DATE_LABELS: Readonly<Record<string, readonly RegExp[]>> = {
  noticeDate: [/Notice Date/i, /Fecha del Aviso/i, /^\s*(?:Date|Fecha)\s*$/i],
  deadlineDate: [
    /SUBMIT BY/i,
    /SEND THESE ITEMS BY/i,
    /RETURN THIS FORM BY/i,
    /PLEASE REPLY BY/i,
    /FECHA L[IÍ]MITE/i,
    /ENTREGUE ANTES DEL/i,
  ],
  effectiveDate: [
    /Effective Date/i,
    /Coverage Ends Without Action/i,
    /Fecha de Vigencia/i,
    /Benefits? start/i,
  ],
  aidPaidPendingDeadline: [
    /If you ask for a hearing before/i,
    /If you ask before/i,
    /if you return the completed .{0,20} before/i,
    /[Ss]i la pide antes del/i,
    /[Ss]i pide una audiencia antes del/i,
  ],
};

/** Fields whose value is a date, in the order Review shows them. */
const DATE_FIELDS = [
  'noticeDate',
  'deadlineDate',
  'effectiveDate',
  'aidPaidPendingDeadline',
] as const;

/**
 * The first date associated with any of `labels`.
 *
 * Three layers, strongest first:
 *
 *   1. **on the label's own line, after the label** — slicing to after the match
 *      matters, or a date printed *before* the label on the same line is claimed
 *      by the wrong field;
 *   2. **continuing onto the next line** — measured on notice 05, where the
 *      recogniser returns "...before September 28," and puts `2026` at the start
 *      of the following line. Notice 07 keeps the same sentence intact, so this
 *      is a per-page reality rather than a property of the form;
 *   3. **in the label's spatial neighbour** — the +4.8pp case, where the label
 *      and its value are six lines apart in reading order and on the same row.
 *
 * Returns the **raw matched text** with the lines it came from, not a parsed
 * date. That is what keeps "there is no date here" distinct from "there is
 * something here I could not read" — the first means keep looking, the second
 * means stop and flag, and a function that returns `undefined` for both cannot
 * express the difference.
 */
function findDate(
  lines: readonly OcrLine[],
  labels: readonly RegExp[],
): Found<string> | undefined {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const hit = label.exec(line.text);
      if (!hit) continue;

      const after = line.text.slice(hit.index + hit[0].length);

      const inline = dateShaped().exec(after);
      if (inline?.[1]) return { value: inline[1], lines: [i] };

      const partial = trailingPartialDate(after);
      if (partial !== undefined) {
        const year = leadingYear(lines[i + 1]?.text ?? '');
        if (year !== undefined) return { value: `${partial} ${year}`, lines: [i, i + 1] };
      }

      const neighbourIndex = valueIndexFor(lines, i);
      if (neighbourIndex !== undefined) {
        const neighbour = lines[neighbourIndex];
        const nearby = neighbour === undefined ? null : dateShaped().exec(neighbour.text);
        if (nearby?.[1]) return { value: nearby[1], lines: [i, neighbourIndex] };
      }
    }
  }
  return undefined;
}

/** Turn a raw reading into a field, carrying provenance and any invalid flag. */
function dateField(found: Found<string>): ExtractedField | undefined {
  const reading: DateReading = parseDate(found.value);
  if (reading.kind === 'unreadable') return undefined;
  return {
    value: reading.iso,
    source: 'regex',
    sourceLineIndexes: found.lines,
    ...(reading.kind === 'implausible' ? { invalid: 'implausible_date' as const } : {}),
  };
}

const plainField = (found: Found<string>): ExtractedField => ({
  value: found.value,
  source: 'regex',
  sourceLineIndexes: found.lines,
});

const tableField = (value: string): ExtractedField => ({ value, source: 'regex' });

/**
 * The appeal deadline, derived rather than printed.
 *
 * Only ever derived from a window the **document itself states**, never from a
 * rule known to be true (CLAUDE.md §16). And it points its provenance at the
 * evidence — the notice-date line and the sentence stating the window — because
 * a derived value with no lines highlights nothing on the photograph.
 *
 * The two appeal clocks are different questions and must never collapse into one
 * number: this is the 90-day deadline to *request* a hearing, and
 * `aidPaidPendingDeadline` is the 10-day window to keep benefits flowing while it
 * is pending. Quote one when the household needs the other and they lose either
 * their benefits or a right they still have.
 */
function deriveAppealDeadline(
  lines: readonly OcrLine[],
  noticeDate: ExtractedField | undefined,
): ExtractedField | undefined {
  const iso = noticeDate?.value;
  if (iso === undefined || noticeDate?.invalid !== undefined) return undefined;

  let windowLine: number | undefined;
  let days: number | undefined;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]?.text ?? '';
    const stated = /within\s+(\d{1,3})\s+days|dentro\s+de\s+(\d{1,3})\s+d[ií]as/i.exec(text);
    const n = stated?.[1] ?? stated?.[2];
    if (n !== undefined) {
      days = Number(n);
      windowLine = i;
      break;
    }
  }
  if (days === undefined || windowLine === undefined) return undefined;

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return undefined;
  const from = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const value = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;

  const evidence = [...(noticeDate?.sourceLineIndexes ?? []), windowLine].sort((a, b) => a - b);
  return { value, source: 'regex', sourceLineIndexes: evidence };
}

export function extract(input: ExtractionInput): ExtractionResult {
  const lines = input.lines;

  // Redaction runs first and over the whole page, because it is a write gate:
  // nothing downstream may hand the app text that has not been through it.
  const redaction = redact(input.text);
  const folded = foldPage(redaction.text);

  const fields: Record<string, ExtractedField | undefined> = {};

  for (const key of DATE_FIELDS) {
    const found = findDate(lines, DATE_LABELS[key] ?? []);
    if (found === undefined) continue;
    const field = dateField(found);
    if (field !== undefined) fields[key] = field;
  }
  fields['appealDeadline'] = deriveAppealDeadline(lines, fields['noticeDate']);

  const recipient = findRecipient(lines);
  if (recipient !== undefined) fields['recipientName'] = plainField(recipient);

  const caseNumber = findCaseNumber(lines);
  if (caseNumber !== undefined) fields['caseNumber'] = plainField(caseNumber);

  for (const [key, table] of [
    ['formId', FORM_IDS],
    ['programId', PROGRAMS],
    ['agency', AGENCIES],
    ['actionType', ACTIONS],
  ] as const) {
    const value = firstMatch(folded, table);
    if (value !== undefined) fields[key] = tableField(value);
  }

  const docs = allMatches(folded, DOC_LEXICON);

  return {
    fields: fields as ExtractedNotice,
    ...(docs.length > 0 ? { requiredDocs: docs } : {}),
    redacted: true,
    containedSsn: redaction.containedSsn,
  };
}

/** The redacted text, for the caller that persists it. */
export function redactText(text: string): { text: string; containedSsn: boolean } {
  return redact(text);
}

export { tidy };
