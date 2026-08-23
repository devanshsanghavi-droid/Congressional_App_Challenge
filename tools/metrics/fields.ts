/**
 * Carta metrics harness — the field taxonomy.
 *
 * AUTHORSHIP: Claude. Harness infrastructure. This file decides how a value is
 * *compared*, never how a value is *found* — finding is the extraction island's
 * job and Devansh's work.
 *
 * Two distinctions live here, and both change what the metrics table means.
 *
 * 1. WHAT KIND OF VALUE IT IS.  Ground truth stores dates as ISO and money
 *    without a currency symbol, but the page prints "SEPTEMBER 5, 2026" and
 *    "$1,847.20". Comparing those as strings would score a perfect read as a
 *    miss. Each field declares a kind, and the kind supplies both a comparator
 *    and the set of surface forms the value could legitimately appear in.
 *
 * 2. WHAT KIND OF EVIDENCE IT IS.  Not every ground-truth field is on the page:
 *
 *      printed   — the value is literally there. OCR can find it, and if it
 *                  cannot, that is an OCR failure.
 *      derived   — the value is computed from a printed value plus a printed
 *                  rule. `appeal_deadline` is the case: no notice prints a
 *                  hearing deadline, they print "within 90 days of the date of
 *                  this notice", and the deadline is that date plus ninety
 *                  days. Scoring it as an OCR miss would be measuring the wrong
 *                  thing — and this is exactly the rule in CLAUDE.md §4 that
 *                  the model may not invent legal rules: the 90 comes off the
 *                  page, the arithmetic is deterministic code.
 *      semantic  — a normalised label standing in for prose. The page says "We
 *                  did not receive your Semi-Annual Eligibility Status Report";
 *                  ground truth says `reason: "SAR 7 not returned"`. There is
 *                  no string to find. These are classification targets.
 *
 *    The OCR-ceiling metric only applies to `printed` fields. Reporting a
 *    ceiling for the other two would be a made-up number.
 */

export type FieldKind = 'date' | 'money' | 'time' | 'count' | 'text' | 'id' | 'doclist';
export type Evidence = 'printed' | 'derived' | 'semantic';

export interface FieldSpec {
  readonly kind: FieldKind;
  readonly evidence: Evidence;
  /**
   * True when the value is short enough that finding it in the page text is
   * weak proof it was found in the *right place* — a bare "3" for household
   * size matches any 3 on the page. Flagged in the report rather than dropped.
   */
  readonly lowSpecificity?: boolean;
  readonly note?: string;
}

/**
 * Every key that appears in ground_truth.json `fields`, plus the notice-level
 * attributes the cascade also has to produce. `tests/node/corpus-integrity.test.ts`
 * fails if the corpus grows a field that is not described here, so this cannot
 * silently fall behind the data.
 */
export const FIELD_SPECS: Readonly<Record<string, FieldSpec>> = {
  // --- notice-level attributes ------------------------------------------
  form_id: { kind: 'id', evidence: 'printed', note: 'Layer 0 form fingerprint.' },
  program: { kind: 'text', evidence: 'printed' },
  agency: {
    kind: 'text',
    evidence: 'semantic',
    note: 'Page prints "HEALTH AND HUMAN SERVICES AGENCY / SANTA CLARA COUNTY"; truth is the normalised "Santa Clara County HHSA".',
  },
  language: { kind: 'text', evidence: 'semantic', note: 'Detected, not printed.' },
  action_type: {
    kind: 'text',
    evidence: 'semantic',
    note: 'Classification. Drives the whole scheduling path, so a miss here is worse than a miss on any single date.',
  },

  // --- dates -------------------------------------------------------------
  notice_date: { kind: 'date', evidence: 'printed' },
  deadline_date: {
    kind: 'date',
    evidence: 'printed',
    note: 'The number on the Home screen. The one field the product cannot be wrong about.',
  },
  effective_date: { kind: 'date', evidence: 'printed' },
  certification_end: { kind: 'date', evidence: 'printed' },
  aid_paid_pending_deadline: {
    kind: 'date',
    evidence: 'printed',
    note: 'Highest-stakes value in the app (CLAUDE.md §16). Printed in prose, not in a labelled field — the hard case for spatial anchoring.',
  },
  appeal_deadline: {
    kind: 'date',
    evidence: 'derived',
    note: 'Never printed. notice_date + 90 days, from the printed sentence "within 90 days of the date of this notice". Holds for all four notices that carry it.',
  },

  // --- money -------------------------------------------------------------
  gross_income: { kind: 'money', evidence: 'printed' },
  monthly_income: { kind: 'money', evidence: 'printed' },
  old_amount: { kind: 'money', evidence: 'printed' },
  new_amount: { kind: 'money', evidence: 'printed' },
  monthly_amount: { kind: 'money', evidence: 'printed' },
  income_reporting_threshold: {
    kind: 'money',
    evidence: 'printed',
    note: 'Printed as "$2,510" with no cents while truth carries "2510.00" — the case that forces money comparison to be numeric.',
  },

  // --- identifiers and short values -------------------------------------
  case_number: { kind: 'id', evidence: 'printed' },
  worker_id: { kind: 'id', evidence: 'printed' },
  citation: { kind: 'id', evidence: 'printed', note: 'Regulation reference, e.g. MPP 63-508.' },
  household_size: { kind: 'count', evidence: 'printed', lowSpecificity: true },
  appeal_window_days: { kind: 'count', evidence: 'printed', lowSpecificity: true },
  appointment_time: { kind: 'time', evidence: 'printed' },

  // --- text --------------------------------------------------------------
  recipient_name: { kind: 'text', evidence: 'printed' },
  employer: { kind: 'text', evidence: 'printed' },
  appointment_address: { kind: 'text', evidence: 'printed' },
  report_month: { kind: 'text', evidence: 'printed' },
  benefit_month: { kind: 'text', evidence: 'printed' },
  reason: {
    kind: 'text',
    evidence: 'semantic',
    note: 'A label summarising a paragraph, not a string on the page.',
  },

  // --- lists -------------------------------------------------------------
  required_docs: {
    kind: 'doclist',
    evidence: 'semantic',
    note: 'Checkbox prose mapped to document-type ids. Scored per item, so a partial list scores partially.',
  },
};

/**
 * The fields that decide whether the product works. A deadline read wrong sends
 * a reminder on the wrong day; an employer name read wrong is cosmetic. The
 * report leads with these and shows the rest below.
 */
export const CRITICAL_FIELDS: readonly string[] = [
  'deadline_date',
  'aid_paid_pending_deadline',
  'notice_date',
  'effective_date',
  'case_number',
  'form_id',
  'action_type',
];

/** Report ordering: critical first, then the rest alphabetically. */
export function orderedFields(present: Iterable<string>): string[] {
  const set = new Set(present);
  const lead = CRITICAL_FIELDS.filter((f) => set.has(f));
  const rest = [...set].filter((f) => !lead.includes(f)).sort();
  return [...lead, ...rest];
}

export function specFor(field: string): FieldSpec {
  const spec = FIELD_SPECS[field];
  if (!spec) throw new Error(`no field spec for "${field}" — add it to tools/metrics/fields.ts`);
  return spec;
}

// ------------------------------------------------------------ normalisation

/**
 * Reduce text to letters and digits only, uppercased, with diacritics stripped.
 *
 * Used for the presence test that produces the OCR ceiling. Stripping
 * punctuation and spacing is what lets one comparison cover "CalFresh /
 * CalWORKs" against "CalFresh/CalWORKs" and "Case Number:  01-4472-9931"
 * against "01-4472-9931". Diacritics go because the corpus PDFs are ASCII
 * ("espanol", "comuniquese") while a recogniser told to expect Spanish often
 * restores the accents — the page and the reading disagree on a detail that
 * carries no information for us.
 */
export function squash(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const MONTHS_EN = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const MONTHS_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/** Split an ISO date without going near Date(), which would apply a timezone. */
function isoParts(iso: string): { y: number; m: number; d: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return undefined;
  const [, y, m, d] = match;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/**
 * Every way a date could legitimately be printed on one of these notices, in
 * both languages. The corpus prints English notices as "SEPTEMBER 5, 2026" and
 * Spanish ones as "5 DE SEPTIEMBRE DE 2026"; the numeric forms are here because
 * real county notices use them and a corpus regenerated with different layouts
 * should not silently start scoring as a miss.
 */
export function dateSurfaceForms(iso: string): string[] {
  const parts = isoParts(iso);
  if (!parts) return [iso];
  const { y, m, d } = parts;
  const en = MONTHS_EN[m - 1] ?? '';
  const es = MONTHS_ES[m - 1] ?? '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return [
    `${en} ${d}, ${y}`,
    `${en} ${pad(d)}, ${y}`,
    `${d} DE ${es} DE ${y}`,
    `${pad(d)} DE ${es} DE ${y}`,
    `${m}/${d}/${y}`,
    `${pad(m)}/${pad(d)}/${y}`,
    iso,
  ];
}

/** "$1,847.20", "1847.20", "$2,510" — all the same number. */
export function moneySurfaceForms(value: string): string[] {
  const cents = moneyToCents(value);
  if (cents === undefined) return [value];
  const whole = Math.trunc(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const grouped = whole.toLocaleString('en-US');
  const forms = [`${whole}.${frac}`, `${grouped}.${frac}`, `$${grouped}.${frac}`, `$${whole}.${frac}`];
  // A whole-dollar amount is often printed without the cents, which is exactly
  // how notice 10 prints its $2,510 reporting threshold.
  if (cents % 100 === 0) forms.push(String(whole), grouped, `$${grouped}`, `$${whole}`);
  return forms;
}

export function timeSurfaceForms(value: string): string[] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return [value];
  const [, h, min] = match;
  const hour24 = Number(h);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  return [`${hour24}:${min}`, `${hour12}:${min} ${suffix}`, `${hour12}:${min}${suffix}`];
}

/** The strings a `printed` field could appear as on the page. */
export function surfaceForms(field: string, value: string): string[] {
  switch (specFor(field).kind) {
    case 'date':
      return dateSurfaceForms(value);
    case 'money':
      return moneySurfaceForms(value);
    case 'time':
      return timeSurfaceForms(value);
    default:
      return [value];
  }
}

// -------------------------------------------------------------- comparators

export function moneyToCents(value: string): number | undefined {
  const cleaned = value.replace(/[$\s,]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Accepts what an extractor might plausibly emit: ISO, the MM/DD/YYYY the GBNF
 * grammar constrains a date field to, or epoch milliseconds. Returns ISO, or
 * undefined if it is not a date — an unparseable value is a wrong value, not a
 * crash.
 */
export function dateToIso(value: string | number): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    // Local-time components: the app computes deadlines in the device's
    // timezone (CLAUDE.md §9), so a date is whatever day it is locally.
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const trimmed = value.trim();
  if (isoParts(trimmed)) return trimmed;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return undefined;
}

function timeTo24h(value: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return undefined;
  const [, h, m, suffix] = match;
  let hour = Number(h);
  if (suffix?.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (suffix?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${m}`;
}

/**
 * Does an extracted value match the truth for this field?
 *
 * Deliberately strict on the things that matter and forgiving on formatting.
 * A date that is one day off is wrong — that is a reminder fired on the wrong
 * morning. "$1,847.20" against "1847.20" is right.
 */
export function valuesMatch(field: string, truth: string, extracted: string | number): boolean {
  const spec = specFor(field);
  const raw = typeof extracted === 'number' ? extracted : extracted.trim();
  if (raw === '') return false;

  switch (spec.kind) {
    case 'date': {
      const got = dateToIso(raw);
      return got !== undefined && got === truth.trim();
    }
    case 'money': {
      const got = moneyToCents(String(raw));
      const want = moneyToCents(truth);
      return got !== undefined && want !== undefined && got === want;
    }
    case 'time': {
      const got = timeTo24h(String(raw));
      const want = timeTo24h(truth);
      return got !== undefined && want !== undefined && got === want;
    }
    case 'count': {
      return Number(raw) === Number(truth) && String(raw).trim() !== '';
    }
    case 'id':
    case 'text':
      return squash(String(raw)) === squash(truth);
    case 'doclist':
      // Handled per item by the scorer; a scalar comparison is meaningless.
      throw new Error(`${field} is a list — score it item by item`);
  }
}
