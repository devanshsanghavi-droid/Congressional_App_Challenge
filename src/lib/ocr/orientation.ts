/**
 * Is this photograph upside down?
 *
 * AUTHORSHIP: Claude. App-side, and pure — no imports, so it is testable in
 * bare Node against the corpus.
 *
 * WHY THIS EXISTS
 * ---------------
 * Measured 2026-08-19 and 2026-08-20 on `na960x-angled-08.jpg`, a real capture
 * of a page rotated ~180°:
 *
 *   - the recogniser reads it **perfectly**. 32 lines, 0.978 mean confidence,
 *     all nine printed fields present in the text. Rotating the image 180° and
 *     re-running produces the same line count and the same confidence, so
 *     nothing in the recogniser's own output says anything is wrong.
 *   - deterministic extraction scores **4 of 9** on it, against an OCR ceiling
 *     of 9 of 9.
 *
 * Extraction quietly halves while every other signal reports success, because
 * the bounding boxes come back in the raw camera frame: the letterhead that
 * sits at (0.12, 0.12) on an upright capture is at (0.82, 0.51) here. Anything
 * that reasons about where a value sits relative to its label is reading the
 * page upside down.
 *
 * Correcting the geometry needs a perspective transform (the capture is
 * rotation *plus* skew, and a plain 180° box flip only halves the error). SPEC
 * §10 cut that work. Asking the user to turn the phone around costs one
 * sentence and gives correct geometry *and* correct text, so that is what this
 * is for.
 *
 * HOW IT DETECTS
 * --------------
 * Not by reading order. Vision's native ordering is semantic, and on an
 * inverted page it runs bottom-to-top of the frame — which was the original
 * signal — but `expo-mlkit-ocr` sorts lines geometrically before returning
 * them, so that ordering is gone by the time the app sees it.
 *
 * What survives is a structural fact about mailed letters rather than about
 * these forms: **the recipient's address block sits in the upper third of page
 * one.** So find the anchors that belong to that block and ask where they
 * ended up. Sender addresses are excluded — a state agency's PO box in the
 * footer is the one thing that would point the wrong way, and on the inverted
 * capture it is exactly what a naive version matched.
 *
 * Validated on all 23 real captures: 23/23 correct, with upright anchors
 * landing at 0.21–0.32 and the inverted one at 0.65. **The inverted class has
 * n=1**, so treat the threshold as provisional: it is a wide margin around a
 * single example, not a validated rate.
 */

import type { OcrLine } from './types.ts';

/** "SAN JOSE, CA 95122" — the last line of a US address block. */
const CITY_STATE_ZIP = /\b[A-Z][A-Za-z .]+,\s*[A-Z]{2}\s+\d{5}\b/;

/** The case-number line, which sits in the same header block on these notices. */
const CASE_LINE = /\b(case|caso)\s*(number|no\b|núm)/i;

/**
 * Lines that look like an address but belong to the *sender*. A state agency's
 * PO box lives in the footer, so counting it would drag the estimate downward
 * on an upright page and, worse, point the wrong way on an inverted one.
 */
const SENDER_ADDRESS = /P\.?\s*O\.?\s*Box|Hearings Division|Sacramento/i;

/**
 * Above this, the recipient block is in the lower half of the frame and the
 * page is upside down. Halfway between the two observed populations.
 */
const INVERTED_ABOVE = 0.5;

export type Orientation = 'upright' | 'inverted' | 'unknown';

export interface OrientationCheck {
  readonly orientation: Orientation;
  /** Where the top-block anchors landed, 0 (frame top) to 1 (frame bottom). */
  readonly anchorPosition?: number;
  /** How many anchors were found. Zero means no opinion. */
  readonly anchorCount: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return (((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/**
 * Returns `unknown` when there is nothing to go on — an unfamiliar layout, a
 * photo of something that is not a notice, too little text.
 *
 * That is the important default. This runs on the camera screen and its only
 * output is a warning; a false "turn your phone around" on a photo that is the
 * right way up is worse than staying quiet, because it teaches the user to
 * ignore the warning. **No opinion unless the evidence is there.**
 */
export function checkOrientation(lines: readonly OcrLine[]): OrientationCheck {
  if (lines.length < 6) return { orientation: 'unknown', anchorCount: 0 };

  const ys = lines.map((line) => line.box.y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const span = bottom - top;
  // A page whose text occupies almost no vertical extent is not a page.
  if (span < 0.1) return { orientation: 'unknown', anchorCount: 0 };

  const positions: number[] = [];
  for (const line of lines) {
    if (SENDER_ADDRESS.test(line.text)) continue;
    if (CITY_STATE_ZIP.test(line.text) || CASE_LINE.test(line.text)) {
      positions.push((line.box.y - top) / span);
    }
  }

  if (positions.length === 0) return { orientation: 'unknown', anchorCount: 0 };

  const anchorPosition = median(positions);
  return {
    orientation: anchorPosition > INVERTED_ABOVE ? 'inverted' : 'upright',
    anchorPosition,
    anchorCount: positions.length,
  };
}

/** Should the camera screen warn before the user walks away from the page? */
export function shouldWarnUpsideDown(check: OrientationCheck): boolean {
  return check.orientation === 'inverted';
}
