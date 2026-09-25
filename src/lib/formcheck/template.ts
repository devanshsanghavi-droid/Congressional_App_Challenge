/**
 * A blank form, described well enough to check a filled-in copy of it.
 *
 * AUTHORSHIP: Claude. App-side, pure.
 *
 * Templates are content (`content/forms/*.json`), not code: a new form is a new
 * file, never a new branch. Each one is generated from a render of the blank
 * form read by the same recogniser the phone uses (tools/forms/make-demo-sar7.py),
 * so its anchor boxes are in exactly the units a photo's lines will be.
 *
 * Every rule a template enforces carries the sentence from the real form that
 * states it, and where that sentence was read. CLAUDE.md §16: Carta checks only
 * what a form says about itself.
 */

import type { OcrBox } from '../ocr/types.ts';
import type { Anchor } from './align.ts';

export type FormRuleId = 'answered' | 'signed' | 'dated_after_report_month';

export interface FormRule {
  /** The form's own words for the rule, verbatim. */
  readonly formSays: string;
  /** What the form says happens when it is not met, verbatim. */
  readonly ifNot: string;
}

export interface TemplateQuestion {
  readonly id: string;
  readonly number: number;
  /** The printed question, as the recogniser reads it on the blank form. */
  readonly label: string;
  readonly yes: OcrBox;
  readonly no: OcrBox;
}

/** Somewhere a person writes: above a printed rule, found by its printed label. */
export interface WritingArea {
  readonly label: string;
  readonly box: OcrBox;
  /** Gap from the bottom of `box` down to the printed rule, in page heights. */
  readonly ruleBelow: number;
}

export interface FormTemplate {
  readonly id: string;
  /** Matched against the notice's confirmed form ID. */
  readonly formId: string;
  readonly revision: string;
  /** Text that must appear on the page for this template to apply, e.g. a footer. */
  readonly footerMarker: string;
  readonly anchors: readonly Anchor[];
  readonly questions: readonly TemplateQuestion[];
  readonly signature: WritingArea;
  readonly signatureDate: WritingArea;
  readonly reportMonthLabel: string;
  readonly rules: Readonly<Record<FormRuleId, FormRule>>;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly verifiedOn: string;
}

function fail(what: string): never {
  throw new Error(`form template: ${what}`);
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${what} must be a non-empty string`);
  return value;
}

function box(value: unknown, what: string): OcrBox {
  const b = value as Record<string, unknown> | null;
  const n = (k: string): number => {
    const v = b?.[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) fail(`${what}.${k} must be a number from 0 to 1`);
    return v;
  };
  const parsed = { x: n('x'), y: n('y'), w: n('w'), h: n('h') };
  if (parsed.w === 0 || parsed.h === 0 || parsed.x + parsed.w > 1.0001 || parsed.y + parsed.h > 1.0001) {
    fail(`${what} must be a non-empty box inside the page`);
  }
  return parsed;
}

function writingArea(raw: Record<string, unknown> | undefined, what: string): WritingArea {
  const gap = raw?.['rule_below'];
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 0.05) {
    fail(`${what}.rule_below must be a small non-negative number`);
  }
  return { label: text(raw?.['label'], `${what}.label`), box: box(raw?.['box'], `${what}.box`), ruleBelow: gap };
}

/** Parse and validate a template. Throws on anything malformed: a bad template would put rings in the wrong place. */
export function parseFormTemplate(raw: unknown): FormTemplate {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') fail('not an object');

  const anchors = Array.isArray(r['anchors']) ? r['anchors'] : fail('anchors must be an array');
  if (anchors.length < 8) fail('needs at least 8 anchors to align a photo');
  const questions = Array.isArray(r['questions']) ? r['questions'] : fail('questions must be an array');
  if (questions.length === 0) fail('needs at least one question');

  const rules = (r['rules'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const rule = (id: FormRuleId): FormRule => ({
    formSays: text(rules[id]?.['form_says'], `rules.${id}.form_says`),
    ifNot: text(rules[id]?.['if_not'], `rules.${id}.if_not`),
  });

  const sig = r['signature'] as Record<string, unknown> | undefined;
  const date = r['signature_date'] as Record<string, unknown> | undefined;
  const sourceUrl = text(r['source_url'], 'source_url');
  if (!sourceUrl.startsWith('https://')) fail('source_url must be an https URL');
  const verifiedOn = text(r['verified_on'], 'verified_on');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn)) fail('verified_on must be YYYY-MM-DD');

  return {
    id: text(r['id'], 'id'),
    formId: text(r['form_id'], 'form_id'),
    revision: text(r['revision'], 'revision'),
    footerMarker: text(r['footer_marker'], 'footer_marker'),
    anchors: anchors.map((a, i) => {
      const entry = a as Record<string, unknown>;
      return { text: text(entry['text'], `anchors[${i}].text`), box: box(entry['box'], `anchors[${i}].box`) };
    }),
    questions: questions.map((q, i) => {
      const entry = q as Record<string, unknown>;
      const number = entry['number'];
      if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) fail(`questions[${i}].number`);
      return {
        id: text(entry['id'], `questions[${i}].id`),
        number,
        label: text(entry['label'], `questions[${i}].label`),
        yes: box(entry['yes'], `questions[${i}].yes`),
        no: box(entry['no'], `questions[${i}].no`),
      };
    }),
    signature: writingArea(sig, 'signature'),
    signatureDate: writingArea(date, 'signature_date'),
    reportMonthLabel: text(r['report_month_label'], 'report_month_label'),
    rules: {
      answered: rule('answered'),
      signed: rule('signed'),
      dated_after_report_month: rule('dated_after_report_month'),
    },
    sourceUrl,
    sourceName: text(r['source_name'], 'source_name'),
    verifiedOn,
  };
}

/** "SAR 7", "SAR7", "sar 7 (rev 5/25)" all name the same form. */
export function sameFormId(a: string | undefined, b: string): boolean {
  if (a === undefined) return false;
  const key = (s: string): string => s.toUpperCase().replace(/\(.*$/, '').replace(/[^A-Z0-9]/g, '');
  return key(a) === key(b);
}
