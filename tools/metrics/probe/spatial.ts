/**
 * FEASIBILITY PROBE (B) — text plus geometry. **Not shipping code.** See patterns.ts.
 *
 * Identical patterns to `text-only.ts`. The only difference is how a label is
 * connected to its value.
 *
 * WHY THIS VARIANT EXISTS
 * -----------------------
 * OCR reading order is not document order. On `na960x-clean-06` the recogniser
 * emits:
 *
 *     line  8   "Notice Date"                y = 0.292
 *     line  9   "Effective Date"             y = 0.315
 *     line 10   "NA 960X SAR (Rev. 10/24)"   y = 0.153
 *     line 11   "Case Number: 01-4472-9931"  y = 0.250
 *     ...
 *     line 14   "SEPTEMBER 8, 2026"          y = 0.292
 *     line 15   "SEPTEMBER 30, 2026"         y = 0.317
 *
 * The label and its value are six lines apart in the text and **on the same
 * visual row** — y = 0.292 for both. No amount of window-tuning over the joined
 * string recovers that association, because the intervening lines contain other
 * dates. The geometry recovers it exactly.
 *
 * That is SPEC §4's Layer 1 (spatial anchoring) stated as a measurement: the
 * gap between this probe and `text-only.ts` is what Layer 1 is worth.
 *
 * Run:  npm run metrics -- --extractor tools/metrics/probe/spatial.ts
 */

import type { OcrLine } from '../ocr-cache.ts';
import type { ExtractionInput, ExtractionResult, ExtractedField } from '../extractor.ts';
import {
  ACTIONS,
  DATE_LABELS,
  DATE_PATTERN,
  DOC_LEXICON,
  FORM_IDS,
  MONEY_LABELS,
  PROGRAMS,
  addDays,
  allMatches,
  centreY,
  firstMatch,
  parseDate,
  rightEdge,
} from './patterns.ts';

/**
 * Two lines are on the same visual row when their vertical centres are within
 * half a line height of each other. Half rather than a fixed constant because
 * the tolerance has to scale with the type size, and a skewed capture pushes
 * the two ends of a row apart.
 */
function sameRow(a: OcrLine, b: OcrLine): boolean {
  return Math.abs(centreY(a) - centreY(b)) <= Math.max(a.box.h, b.box.h) * 0.6;
}

/**
 * The value belonging to a label: the nearest line to its right on the same
 * row, else the nearest line below that starts at roughly the same x.
 */
function valueFor(lines: readonly OcrLine[], labelIndex: number): string | undefined {
  const label = lines[labelIndex];
  if (!label) return undefined;

  const toTheRight = lines
    .filter((line, i) => i !== labelIndex && sameRow(label, line) && line.box.x >= rightEdge(label) - 0.01)
    .sort((a, b) => a.box.x - b.box.x);
  if (toTheRight[0]) return toTheRight[0].text;

  const below = lines
    .filter(
      (line, i) =>
        i !== labelIndex &&
        line.box.y > label.box.y + label.box.h * 0.4 &&
        line.box.y < label.box.y + label.box.h * 3 &&
        Math.abs(line.box.x - label.box.x) < 0.08,
    )
    .sort((a, b) => a.box.y - b.box.y);
  return below[0]?.text;
}

/**
 * A date for `labels`: look on the label's own line first — many are printed
 * as one string, "SUBMIT BY: SEPTEMBER 5, 2026" — then in its spatial
 * neighbour.
 */
function dateNear(lines: readonly OcrLine[], labels: readonly RegExp[]): string | undefined {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const found = label.exec(line.text);
      if (!found) continue;

      const rest = line.text.slice(found.index + found[0].length);
      const inline = new RegExp(DATE_PATTERN).exec(rest);
      if (inline?.[1]) {
        const iso = parseDate(inline[1]);
        if (iso !== undefined) return iso;
      }

      const neighbour = valueFor(lines, i);
      if (neighbour !== undefined) {
        const nearby = new RegExp(DATE_PATTERN).exec(neighbour);
        if (nearby?.[1]) {
          const iso = parseDate(nearby[1]);
          if (iso !== undefined) return iso;
        }
      }
    }
  }
  return undefined;
}

/** Money on the label's line, or in its spatial neighbour. */
function moneyNear(lines: readonly OcrLine[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !label.test(line.text)) continue;
    const inline = /\$([\d,]+\.\d{2})/.exec(line.text);
    if (inline?.[1]) return inline[1].replace(/,/g, '');
    const neighbour = valueFor(lines, i);
    const nearby = neighbour === undefined ? null : /\$?([\d,]+\.\d{2})/.exec(neighbour);
    if (nearby?.[1]) return nearby[1].replace(/,/g, '');
  }
  return undefined;
}

/** Plain text on the label's line or in its neighbour. */
function textNear(lines: readonly OcrLine[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !label.test(line.text)) continue;
    const neighbour = valueFor(lines, i);
    if (neighbour !== undefined && !label.test(neighbour)) return neighbour.trim();
  }
  return undefined;
}

/**
 * The recipient: the topmost line of the address block, found by anchoring on
 * the city line and walking up through lines that share its left edge. Using
 * the left edge rather than the line index is what makes this survive the
 * reading-order interleaving that breaks the text-only version — on the SSA
 * notice, "Case Number" and "Worker ID" are emitted *between* the address
 * lines, because they sit in the right-hand column.
 */
function recipientName(lines: readonly OcrLine[]): string | undefined {
  const city = lines.findIndex((line) => /,\s*CA\s+\d{5}/.test(line.text));
  if (city < 0) return undefined;
  const cityLine = lines[city];
  if (!cityLine) return undefined;

  const column = lines
    .filter((line) => Math.abs(line.box.x - cityLine.box.x) < 0.03 && line.box.y <= cityLine.box.y)
    .sort((a, b) => a.box.y - b.box.y);

  // The street line is the anchor: it is the one line of the block with an
  // unmistakable shape (leading house number). The recipient is the caps line
  // directly above it. Walking further up was the earlier version's bug — on
  // the housing notice it climbed past the name into the document title.
  const street = column.findIndex((line) => /^\d+\s+[A-Z0-9]/.test(line.text.trim()));
  if (street > 0) {
    const candidate = (column[street - 1]?.text ?? '').trim();
    if (/^[A-Z][A-Z .'-]{3,40}$/.test(candidate)) return candidate;
  }
  return undefined;
}

const field = (value: string): ExtractedField => ({ value, source: 'probe-spatial' });

export function extract(input: ExtractionInput): ExtractionResult {
  const lines = input.lines;
  const text = input.text;
  const out: Record<string, ExtractedField | undefined> = {};
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') out[key] = field(value);
  };

  set('form_id', firstMatch(text, FORM_IDS));
  set('program', firstMatch(text, PROGRAMS));
  set('action_type', firstMatch(text, ACTIONS));
  set('recipient_name', recipientName(lines));

  set('case_number', /Case Number:?\s*([\w-]+)/i.exec(text)?.[1]);
  set('worker_id', /Worker ID:?\s*([\w-]+)/i.exec(text)?.[1]);

  const noticeDate = dateNear(lines, DATE_LABELS['notice_date'] ?? []);
  set('notice_date', noticeDate);
  set('deadline_date', dateNear(lines, DATE_LABELS['deadline_date'] ?? []));
  set('effective_date', dateNear(lines, DATE_LABELS['effective_date'] ?? []));
  set('aid_paid_pending_deadline', dateNear(lines, DATE_LABELS['aid_paid_pending_deadline'] ?? []));

  if (noticeDate !== undefined && /within 90 days/i.test(text)) {
    set('appeal_deadline', addDays(noticeDate, 90));
  }

  for (const [label, key] of MONEY_LABELS) {
    if (out[key] === undefined) set(key, moneyNear(lines, label));
  }

  // Long-tail fields the text-only variant cannot reach at all, because every
  // one of them is a two-column label/value pair.
  set('employer', textNear(lines, /Employer name|Nombre del empleador/i));
  set('household_size', textNear(lines, /Number of people in household/i));
  set('appointment_time', /AT\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(text)?.[1]);
  set('citation', /Regulation:\s*(MPP\s*[\d-]+)/i.exec(text)?.[1]);
  set('report_month', /Report Month:?\s*([A-Z]+ \d{4})/i.exec(text)?.[1]);
  set('benefit_month', /Benefit Month:?\s*([A-Z]+ \d{4})/i.exec(text)?.[1]);

  const docs = allMatches(text, DOC_LEXICON);
  return docs.length > 0 ? { fields: out, requiredDocs: docs } : { fields: out };
}
