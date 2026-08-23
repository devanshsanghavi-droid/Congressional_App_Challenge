/**
 * FEASIBILITY PROBE — measurement instrument, not shipping code.
 *
 * ---------------------------------------------------------------------------
 * AUTHORSHIP AND SCOPE. CLAUDE.md §15 reserves /src/extraction for Devansh:
 * the schema, the GBNF grammar, the prompt construction, the redaction matcher,
 * the region selection, the pre-fill heuristics, the sanity pass and the
 * confidence model are his work.
 *
 * This file is none of those. It is an instrument built to answer one
 * architectural question — *how much of the deterministic result survives the
 * move from clean digital text to photographed OCR* — and it is deliberately
 * probe-shaped rather than production-shaped: no confidence model, no template
 * registry, no provenance, no error handling worth the name. It exists to
 * produce a number.
 *
 * **It must not be copied into /src/extraction.** It was written with the
 * ground truth visible, which is fine for a design decision and disqualifying
 * for a shipped accuracy figure. It is also fitted to ten notices; the patterns
 * below are not a parser, they are ten notices' worth of hindsight.
 * ---------------------------------------------------------------------------
 *
 * Ported from Devansh's `probe_deterministic.py` (approach, not code), which
 * scored 100% precision / 95.5% recall on core fields against `pdftotext`
 * output. That is an upper bound. This version reads the real OCR cache.
 */

import type { OcrLine } from '../ocr-cache.ts';

export const MONTHS_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** The nine fields the pdftotext probe called "core" — kept identical so the
 *  two runs are comparable. Note `form_id` is deliberately not among them. */
export const PROBE_CORE_FIELDS: readonly string[] = [
  'recipient_name',
  'program',
  'action_type',
  'case_number',
  'notice_date',
  'deadline_date',
  'effective_date',
  'appeal_deadline',
  'aid_paid_pending_deadline',
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** "SEPTEMBER 8, 2026" or "12 de octubre de 2026" -> "2026-09-08". */
export function parseDate(raw: string): string | undefined {
  const s = raw.trim().toLowerCase();

  const en = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (en) {
    const month = MONTHS_EN.indexOf(en[1] ?? '');
    if (month >= 0) return `${en[3]}-${pad(month + 1)}-${pad(Number(en[2]))}`;
  }

  const es = /^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(s);
  if (es) {
    const month = MONTHS_ES.indexOf(es[2] ?? '');
    if (month >= 0) return `${es[3]}-${pad(month + 1)}-${pad(Number(es[1]))}`;
  }
  return undefined;
}

/** Add days to an ISO date without going near a timezone. */
export function addDays(iso: string, days: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Any date, in any of the forms these notices print. */
export const DATE_PATTERN =
  '([A-Za-z]{3,} \\d{1,2},? \\d{4}|\\d{1,2} [Dd][Ee] [A-Za-z]+ [Dd][Ee] \\d{4})';

export const FORM_IDS: readonly (readonly [RegExp, string])[] = [
  [/\bNA\s*960X\s*SAR\b/i, 'NA 960X SAR'],
  [/\bNA\s*960Y\s*SAR\b/i, 'NA 960Y SAR'],
  [/\bNA\s*960\s*SAR\b/i, 'NA 960 SAR'],
  [/\bSAR\s*7\b/i, 'SAR 7'],
  [/\bCF\s*377\.?6\b/i, 'CF 377.6'],
  [/\bMC\s*210\s*RV\b/i, 'MC 210 RV'],
  [/\bSSA-?8202\b/i, 'SSA-8202'],
  [/\bHCV-?AR-?101\b/i, 'HCV-AR-101'],
];

export const PROGRAMS: readonly (readonly [RegExp, string])[] = [
  [/CalFresh\s*\/\s*CalWORKs/i, 'CalFresh/CalWORKs'],
  // \bMedi-?Cal\b also matches the word "medical", which appears on the
  // CF 377.6 CalFresh notice ("Proof of medical expenses"). Require the hyphen
  // or an explicit word boundary that "medical" cannot satisfy.
  [/\bMedi-Cal\b|\bMEDI-?CAL\b(?![A-Z])/, 'Medi-Cal'],
  [/Supplemental Security Income|\bSSI\b/i, 'SSI'],
  [/Housing Choice Voucher/i, 'Housing Choice Voucher'],
  [/\bCalFresh\b/i, 'CalFresh'],
];

export const ACTIONS: readonly (readonly [RegExp, string])[] = [
  [/will stop on|TERMINARAN|Discontinuance/i, 'discontinuance'],
  [/Change in Benefit Amount|will change on/i, 'reduction'],
  [/application is approved|[-—]\s*Approval/i, 'approval'],
  [/INFORMATION\s*\/\s*VERIFICATION NEEDED|ITEMS NEEDED/i, 'info_request'],
  [
    /ELIGIBILITY STATUS REPORT|REDETERMINATION|RECERTIFICATION|INFORME SEMESTRAL/i,
    'recert_due',
  ],
];

export const DOC_LEXICON: readonly (readonly [RegExp, string])[] = [
  [/pay ?check stubs|pay stubs|talones de pago/i, 'pay_stub'],
  [/rent receipt|lease|renta|arrendamiento/i, 'lease_or_rent_receipt'],
  [/utility bills?|utility costs/i, 'utility_bill'],
  [/driver licen[sc]e|photo identification|proof of identity/i, 'photo_id'],
  [/bank statements?/i, 'bank_statement'],
  [/Social Security cards?/i, 'ssn_card'],
  [/California residency/i, 'proof_of_residency'],
  [/proof of any income|proof of all income|proof of earned income/i, 'proof_of_income'],
  [/where you live and who lives with you/i, 'living_arrangement'],
];

/** Labels that introduce each date field, in priority order. */
export const DATE_LABELS: Readonly<Record<string, readonly RegExp[]>> = {
  notice_date: [/Notice Date/i, /Fecha del Aviso/i, /^Date:/i],
  deadline_date: [
    /SUBMIT BY/i,
    /SEND THESE ITEMS BY/i,
    /RETURN THIS FORM BY/i,
    /PLEASE REPLY BY/i,
    /FECHA LIMITE/i,
    /APPOINTMENT:/i,
  ],
  effective_date: [
    /Effective Date/i,
    /Coverage Ends Without Action/i,
    /Recertification Effective/i,
    /Benefits start/i,
  ],
  aid_paid_pending_deadline: [
    /ask for a hearing before/i,
    /la pide antes del/i,
    /If you ask before/i,
  ],
};

export function firstMatch(
  text: string,
  table: readonly (readonly [RegExp, string])[],
): string | undefined {
  for (const [pattern, value] of table) if (pattern.test(text)) return value;
  return undefined;
}

export function allMatches(
  text: string,
  table: readonly (readonly [RegExp, string])[],
): string[] {
  const found = new Set<string>();
  for (const [pattern, value] of table) if (pattern.test(text)) found.add(value);
  return [...found].sort();
}

/** Money that follows a label anywhere in the joined text. */
export const MONEY_LABELS: readonly (readonly [RegExp, string])[] = [
  [/Current monthly benefit/i, 'old_amount'],
  [/New monthly benefit/i, 'new_amount'],
  [/Monthly benefit/i, 'monthly_amount'],
  [/Gross income received|Ingreso bruto recibido/i, 'gross_income'],
  [/Monthly income before taxes/i, 'monthly_income'],
];

/** Vertical centre of a line, for row association. */
export function centreY(line: OcrLine): number {
  return line.box.y + line.box.h / 2;
}

export function rightEdge(line: OcrLine): number {
  return line.box.x + line.box.w;
}
