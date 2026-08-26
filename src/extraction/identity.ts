/**
 * Document identity: which form, which programme, which agency, what action.
 *
 * Ordered tables of `[pattern, value]`, first match wins. Order is load-bearing
 * in both directions — the specific must precede the general, or the general
 * swallows it. `NA 960X SAR` before `NA 960 SAR`; `CalFresh / CalWORKs` before
 * `CalFresh`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY MISSING, AND WHY
 * ---------------------------------------------------------------------------
 * These tables were built from notices **01–07 only**. Notices 08, 09 and 10 are
 * a held-out test set and their forms — `SSA-8202`, `HCV-AR-101` — are **not**
 * listed here even though the probe in `tools/metrics/probe/patterns.ts` names
 * them and I have read that file.
 *
 * Leaving them out is the point. A table containing the answers to the holdout
 * measures nothing except whether I copied them across. Excluded, the holdout
 * measures the only thing worth knowing: whether the cascade generalises to a
 * layout and an agency it was not written against. It will cost `form_id` and
 * `program` on those notices, and that cost is the measurement.
 */

import { compareKey } from './text.ts';

export type Table = readonly (readonly [RegExp, string])[];

/** Matched against the accent-folded, upper-cased whole page. */
export const FORM_IDS: Table = [
  [/\bNA\s*960X\s*SAR\b/, 'NA 960X SAR'],
  [/\bNA\s*960Y\s*SAR\b/, 'NA 960Y SAR'],
  [/\bMC\s*210\s*RV\b/, 'MC 210 RV'],
  [/\bCF\s*377\.?\s*6\b/, 'CF 377.6'],
  [/\bSAR\s*7\b/, 'SAR 7'],
];

export const PROGRAMS: Table = [
  [/CALFRESH\s*\/\s*CALWORKS/, 'CalFresh/CalWORKs'],
  // `MEDI-CAL` with the hyphen required. A bare /MEDICAL/ also matches "Proof of
  // medical expenses", which is printed on the CalFresh CF 377.6 — notice 03
  // would then be read as a Medi-Cal notice.
  [/\bMEDI-CAL\b/, 'Medi-Cal'],
  [/\bCALFRESH\b/, 'CalFresh'],
];

export const AGENCIES: Table = [
  [/DEPARTMENT OF HEALTH CARE SERVICES/, 'DHCS / Santa Clara County'],
  [/HEALTH AND HUMAN SERVICES AGENCY|AGENCIA DE SALUD Y SERVICIOS HUMANOS/, 'Santa Clara County HHSA'],
  [/DEPARTMENT OF SOCIAL SERVICES|DEPARTAMENTO DE SERVICIOS SOCIALES/, 'Santa Clara County DSS'],
];

/**
 * Action type. The most consequential table in the file: it decides whether Home
 * shows a countdown at all, and reading an approval as a discontinuance
 * manufactures an emergency out of good news.
 *
 * Discontinuance and reduction are tried before the recertification patterns
 * because a Notice of Action that stops benefits also carries the programme
 * name, and the recert patterns are broader.
 */
export const ACTIONS: Table = [
  [/DISCONTINUANCE|WILL STOP ON|TERMINARAN/, 'discontinuance'],
  [/CHANGE IN BENEFIT AMOUNT|WILL CHANGE ON/, 'reduction'],
  [/INFORMATION\s*\/\s*VERIFICATION NEEDED|ITEMS NEEDED/, 'info_request'],
  [
    /SEMI-ANNUAL ELIGIBILITY STATUS REPORT|INFORME SEMESTRAL DE ELEGIBILIDAD|ANNUAL REDETERMINATION|RECERTIFICATION/,
    'recert_due',
  ],
];

/**
 * Required documents, keyed to the ids `ground_truth.json` uses.
 *
 * A lexicon, not a rule. It reports what the letter asked for; it never asserts
 * what a programme requires (CLAUDE.md §16). `content/doc_types.json` carries
 * the same warning for the same reason.
 */
export const DOC_LEXICON: Table = [
  [/PAY ?CHECK STUBS|PAY STUBS?|TALONES DE PAGO|PROOF OF EARNED INCOME/, 'pay_stub'],
  [/RENT RECEIPT|LEASE|ARRENDAMIENTO|RECIBO DE RENTA|PROOF OF HOUSING COST/, 'lease_or_rent_receipt'],
  [/UTILITY BILLS?|UTILITY COSTS?|PROOF OF UTILITY|SERVICIOS PUBLICOS/, 'utility_bill'],
  [/DRIVER LICEN[SC]E|PHOTO IDENTIFICATION|PROOF OF IDENTITY|IDENTIFICACION/, 'photo_id'],
  [/BANK STATEMENTS?|ESTADO DE CUENTA/, 'bank_statement'],
  [/SOCIAL SECURITY CARDS?|TARJETA DE SEGURO SOCIAL/, 'social_security_card'],
  [/CALIFORNIA RESIDENCY|PROOF OF RESIDENCY|PROOF OF WHERE YOU LIVE/, 'proof_of_residency'],
  [/MEDICAL EXPENSES|GASTOS MEDICOS/, 'medical_bill'],
  [/CHILD CARE COSTS?|CUIDADO DE NINOS/, 'child_care_receipt'],
];

/** First entry whose pattern matches the folded page. */
export function firstMatch(foldedText: string, table: Table): string | undefined {
  for (const [pattern, value] of table) if (pattern.test(foldedText)) return value;
  return undefined;
}

/** Every entry that matches, de-duplicated and sorted for a stable result. */
export function allMatches(foldedText: string, table: Table): string[] {
  const found = new Set<string>();
  for (const [pattern, value] of table) if (pattern.test(foldedText)) found.add(value);
  return [...found].sort();
}

export const foldPage = (text: string): string => compareKey(text);
