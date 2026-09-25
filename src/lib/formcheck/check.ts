/**
 * Check a filled-in form before it goes in the envelope.
 *
 * AUTHORSHIP: Claude. App-side, pure: it takes the recogniser's lines and the
 * photo's pixels as arguments and touches nothing else, so it runs the same on
 * the phone and in the Node tests against real Apple Vision readings.
 *
 * WHAT IT CHECKS, AND WHAT IT NEVER CLAIMS
 * ----------------------------------------
 * Three of the conditions the state's SAR 7 says make a report "complete", each
 * quoted from the form itself (see the template's `rules`):
 *
 *   1. every YES/NO question has exactly one box marked;
 *   2. the signature line has a signature on it;
 *   3. the form is signed and dated after the last day of the report month.
 *
 * It cannot see what is in the envelope, cannot tell whether an answer is TRUE,
 * and never judges eligibility. So it never says "complete". The screen says
 * which of these three things it looked at and leaves the rest to the county.
 *
 * WHY EACH REGION IS CONFIRMED SEPARATELY
 * ---------------------------------------
 * The alignment can succeed on lines a different form shares with this one: the
 * corpus SAR 7 and the demonstration SAR 7 have the same header, household and
 * submit-by box, and a check that trusted the alignment alone would "read" answer
 * boxes that are not on the page. So before a question is judged, its own printed
 * words must be found where the alignment predicts them. A question whose words
 * are not there is reported as not checked, never guessed.
 */

import type { OcrLine } from '../ocr/types.ts';
import { alignToTemplate, anchorKey, centre, projectBox, similarity } from './align.ts';
import type { AnchorMatch } from './align.ts';
import { applyHomography } from './homography.ts';
import type { Homography, Point } from './homography.ts';
import { aboveRule, inkIn, insetQuad, snapToPrintedBox } from './ink.ts';
import type { GrayImage } from './ink.ts';
import type { FormTemplate, WritingArea } from './template.ts';
import { compareDates, lastDayOf, parseReportMonth, parseWrittenDate } from './written-date.ts';
import type { CalendarDate, CalendarMonth } from './written-date.ts';

export type Quad = readonly [Point, Point, Point, Point];

/** Deliberately not "passed" / "failed": Carta reports what it saw, the county decides. */
export type CheckState = 'looks_done' | 'look_again' | 'not_checked';

export type Finding =
  | {
      readonly kind: 'question';
      readonly number: number;
      readonly state: CheckState;
      readonly why: 'one_box' | 'no_box' | 'both_boxes' | 'not_found';
      readonly answer?: 'yes' | 'no';
      /** Photo coordinates, 0-1. */
      readonly ring?: Quad;
      readonly ink?: { readonly yes: number; readonly no: number };
    }
  | {
      readonly kind: 'signature';
      readonly state: CheckState;
      readonly why: 'signed' | 'no_signature' | 'not_found';
      readonly ring?: Quad;
      readonly ink?: number;
    }
  | {
      readonly kind: 'date';
      readonly state: CheckState;
      readonly why: 'after_report_month' | 'too_early' | 'not_dated' | 'unreadable' | 'no_report_month' | 'not_found';
      readonly written?: CalendarDate;
      /** The last day of the report month: the form must be dated after this. */
      readonly reportMonthEnds?: CalendarDate;
      readonly ring?: Quad;
    };

export type FormCheck =
  | {
      readonly ok: true;
      readonly findings: readonly Finding[];
      readonly reportMonth?: CalendarMonth;
      readonly agreeingLines: number;
    }
  | { readonly ok: false; readonly reason: 'not_lined_up' | 'different_form' };

/** Share of an answer box's inner area that must be pen for the box to count as marked. */
export const BOX_MARKED = 0.06;
/** Share of the signature line's area that must be pen for it to count as signed. */
export const SIGNED = 0.008;
/** How far, in widths of the photo, a label may sit from where the alignment predicts it. */
const LABEL_TOLERANCE = 0.02;
/**
 * How closely a region's own label must match before the region is judged.
 * Stricter than the alignment's threshold on purpose: the corpus SAR 7 prints
 * "Did your address change? NO" roughly where this form prints "3. Did your
 * address change?", and at the alignment's 0.82 the check judged an answer box
 * that is not on that page. Measured on tests/fixtures/formcheck/other-layout.
 */
const LABEL_SIMILARITY = 0.9;

export interface CheckInput {
  readonly template: FormTemplate;
  readonly lines: readonly OcrLine[];
  /** Pixel size the lines were normalised against. Only the ratio matters. */
  readonly ocrWidth: number;
  readonly ocrHeight: number;
  /** The same photo, any resolution. */
  readonly image: GrayImage;
  /** What the person says they wrote, when the recogniser could not read it. */
  readonly writtenDate?: CalendarDate;
}

function labelFound(h: Homography, matches: readonly AnchorMatch[], label: string, aspect: number): boolean {
  const key = anchorKey(label);
  const match = matches.find((m) => anchorKey(m.anchor.text) === key);
  if (!match || similarity(anchorKey(match.line.text), key) < LABEL_SIMILARITY) return false;
  const predicted = applyHomography(h, centre(match.anchor.box));
  const observed = centre(match.line.box);
  return Math.hypot(predicted.x - observed.x, (predicted.y - observed.y) * aspect) <= LABEL_TOLERANCE;
}

function toPixels(quad: Quad, image: GrayImage): Quad {
  return quad.map((p) => ({ x: p.x * image.width, y: p.y * image.height })) as unknown as Quad;
}

function union(a: Quad, b: Quad): Quad {
  const xs = [...a, ...b].map((p) => p.x);
  const ys = [...a, ...b].map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

function linesInside(lines: readonly OcrLine[], quad: Quad, grow: number): OcrLine[] {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const height = Math.max(...ys) - Math.min(...ys);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys) - height * grow;
  const y1 = Math.max(...ys) + height * grow;
  return lines.filter((l) => {
    const c = centre(l.box);
    return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
  });
}

/**
 * Is this the form the template describes? Its marker (a footer line) must be on
 * the page. Without this, a different form that shares a header with this one
 * can align well enough to be judged, which is the one mistake this module
 * cannot be allowed to make. The price is that the whole page, footer included,
 * has to be in the photo, and the screen says so.
 */
export function carriesMarker(lines: readonly OcrLine[], marker: string): boolean {
  const key = anchorKey(marker);
  return lines.some((l) => {
    const text = anchorKey(l.text);
    if (text.includes(key)) return true;
    // Allow a misread character or two inside a longer footer line.
    for (let i = 0; i + key.length <= text.length; i++) {
      if (similarity(text.slice(i, i + key.length), key) >= 0.88) return true;
    }
    return false;
  });
}

/** Measure a writing area relative to the printed rule it sits on. */
function writingQuad(h: Homography, area: WritingArea, image: GrayImage): Quad {
  const quad = toPixels(projectBox(h, area.box), image);
  const rule = applyHomography(h, { x: area.box.x + area.box.w / 2, y: area.box.y + area.box.h + area.ruleBelow });
  return aboveRule(image, quad, rule.y * image.height, Math.max(4, Math.round(image.height * 0.006)));
}

export function checkFilledForm(input: CheckInput): FormCheck {
  const { template, lines, image } = input;
  const aspect = input.ocrHeight / input.ocrWidth;
  if (!carriesMarker(lines, template.footerMarker)) return { ok: false, reason: 'different_form' };
  const alignment = alignToTemplate(template.anchors, lines, aspect);
  if (!alignment.ok) return { ok: false, reason: 'not_lined_up' };
  const { h, matches } = alignment;
  const findings: Finding[] = [];

  // 1. Every YES/NO question.
  for (const q of template.questions) {
    const yesQuad = projectBox(h, q.yes);
    const noQuad = projectBox(h, q.no);
    const ring = union(yesQuad, noQuad);
    if (!labelFound(h, matches, q.label, aspect)) {
      findings.push({ kind: 'question', number: q.number, state: 'not_checked', why: 'not_found' });
      continue;
    }
    // Snapped onto the printed square first, then only the inner 60% measured:
    // the printed border is ink too, and a mark worth counting reaches into the
    // middle of the box.
    const radius = Math.max(4, Math.round(image.width * 0.006));
    const yes = inkIn(image, insetQuad(snapToPrintedBox(image, toPixels(yesQuad, image), radius), 0.6)).ratio;
    const no = inkIn(image, insetQuad(snapToPrintedBox(image, toPixels(noQuad, image), radius), 0.6)).ratio;
    const yesMarked = yes >= BOX_MARKED;
    const noMarked = no >= BOX_MARKED;
    if (yesMarked !== noMarked) {
      findings.push({
        kind: 'question', number: q.number, state: 'looks_done', why: 'one_box',
        answer: yesMarked ? 'yes' : 'no', ring, ink: { yes, no },
      });
    } else {
      findings.push({
        kind: 'question', number: q.number, state: 'look_again',
        why: yesMarked ? 'both_boxes' : 'no_box', ring, ink: { yes, no },
      });
    }
  }

  // 2 and 3 sit on one row and are confirmed by the same printed label.
  const rowFound = labelFound(h, matches, template.signature.label, aspect);
  const signatureQuad = projectBox(h, template.signature.box);
  const dateQuad = projectBox(h, template.signatureDate.box);

  if (!rowFound) {
    findings.push({ kind: 'signature', state: 'not_checked', why: 'not_found' });
    findings.push({ kind: 'date', state: 'not_checked', why: 'not_found' });
    const anyQuestion = findings.some((f) => f.kind === 'question' && f.why !== 'not_found');
    if (!anyQuestion) return { ok: false, reason: 'different_form' };
    return { ok: true, findings, agreeingLines: alignment.agreeingLines };
  }

  const signatureInk = inkIn(image, insetQuad(writingQuad(h, template.signature, image), 0.97)).ratio;
  findings.push({
    kind: 'signature',
    state: signatureInk >= SIGNED ? 'looks_done' : 'look_again',
    why: signatureInk >= SIGNED ? 'signed' : 'no_signature',
    ring: signatureQuad,
    ink: signatureInk,
  });

  const reportMonth = parseReportMonth(lines.map((l) => l.text).join('\n'), template.reportMonthLabel);
  const written =
    input.writtenDate ??
    parseWrittenDate(linesInside(lines, dateQuad, 0.35).map((l) => l.text).join(' '));
  const dateInk = inkIn(image, insetQuad(writingQuad(h, template.signatureDate, image), 0.97)).ratio;

  if (written === undefined) {
    findings.push({
      kind: 'date',
      state: dateInk >= SIGNED ? 'not_checked' : 'look_again',
      why: dateInk >= SIGNED ? 'unreadable' : 'not_dated',
      ring: dateQuad,
    });
  } else if (reportMonth === undefined) {
    findings.push({ kind: 'date', state: 'not_checked', why: 'no_report_month', written, ring: dateQuad });
  } else {
    const ends = lastDayOf(reportMonth);
    const after = compareDates(written, ends) > 0;
    findings.push({
      kind: 'date',
      state: after ? 'looks_done' : 'look_again',
      why: after ? 'after_report_month' : 'too_early',
      written,
      reportMonthEnds: ends,
      ring: dateQuad,
    });
  }

  const anyQuestion = findings.some((f) => f.kind === 'question' && f.why !== 'not_found');
  if (!anyQuestion) return { ok: false, reason: 'different_form' };
  return {
    ok: true,
    findings,
    ...(reportMonth === undefined ? {} : { reportMonth }),
    agreeingLines: alignment.agreeingLines,
  };
}

/** How many things were actually looked at, for "Carta checked N things". */
export function checkedCount(findings: readonly Finding[]): number {
  return findings.filter((f) => f.state !== 'not_checked').length;
}
