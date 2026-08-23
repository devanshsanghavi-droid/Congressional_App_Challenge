/**
 * FEASIBILITY PROBE (A) — text only. **Not shipping code.** See patterns.ts.
 *
 * The direct port of the pdftotext probe: joined text, regex, no geometry.
 * Everything a label-and-value rule can reach when the only input is a string.
 *
 * Run:  npm run metrics -- --extractor tools/metrics/probe/text-only.ts
 */

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
  firstMatch,
  parseDate,
} from './patterns.ts';

/**
 * First date appearing after `label`, within `window` characters.
 *
 * The window is the whole point of this variant. On a single-column line like
 * "SUBMIT BY: SEPTEMBER 5, 2026" a tight window works. On the two-column
 * header blocks, OCR reading order puts the label and its value several lines
 * apart with unrelated text between them, and no window setting fixes that
 * without also picking up the wrong date. 400 characters is generous enough to
 * cross a couple of lines and tight enough not to swallow the next section.
 */
function dateAfter(text: string, labels: readonly RegExp[], window = 400): string | undefined {
  for (const label of labels) {
    const found = label.exec(text);
    if (!found) continue;
    const from = found.index + found[0].length;
    const slice = text.slice(from, from + window);
    const date = new RegExp(DATE_PATTERN).exec(slice);
    if (date?.[1]) {
      const iso = parseDate(date[1]);
      if (iso !== undefined) return iso;
    }
  }
  return undefined;
}

/**
 * The recipient sits directly above the street line in a three-line address
 * block: NAME / STREET / CITY, CA ZIP. Anchor on the city line, which is the
 * only one of the three with a reliable shape, and count back two.
 */
function recipientName(lines: readonly string[]): string | undefined {
  for (let i = 2; i < lines.length; i++) {
    if (!/,\s*CA\s+\d{5}/.test(lines[i] ?? '')) continue;
    const candidate = (lines[i - 2] ?? '').trim();
    if (/^[A-Z][A-Z .'-]{3,40}$/.test(candidate)) return candidate;
  }
  return undefined;
}

const field = (value: string): ExtractedField => ({ value, source: 'probe-text' });

export function extract(input: ExtractionInput): ExtractionResult {
  const text = input.text;
  const lines = text.split('\n');
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

  const noticeDate = dateAfter(text, DATE_LABELS['notice_date'] ?? []);
  set('notice_date', noticeDate);
  set('deadline_date', dateAfter(text, DATE_LABELS['deadline_date'] ?? []));
  set('effective_date', dateAfter(text, DATE_LABELS['effective_date'] ?? []));
  set('aid_paid_pending_deadline', dateAfter(text, DATE_LABELS['aid_paid_pending_deadline'] ?? []));

  // The appeal deadline is never printed. It is the notice date plus the window
  // the notice itself states — read off the page, then arithmetic. This is the
  // CLAUDE.md §4 rule in practice: the model does not invent the 90.
  if (noticeDate !== undefined && /within 90 days/i.test(text)) {
    set('appeal_deadline', addDays(noticeDate, 90));
  }

  for (const [label, key] of MONEY_LABELS) {
    if (out[key] !== undefined) continue;
    const found = label.exec(text);
    if (!found) continue;
    const money = /\$([\d,]+\.\d{2})/.exec(text.slice(found.index, found.index + 300));
    if (money?.[1]) set(key, money[1].replace(/,/g, ''));
  }

  const docs = allMatches(text, DOC_LEXICON);
  return docs.length > 0 ? { fields: out, requiredDocs: docs } : { fields: out };
}
