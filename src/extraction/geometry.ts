/**
 * Where a value sits relative to its label.
 *
 * OCR reading order is not document order. On `na960x-clean-06` the label
 * "Notice Date" is line 8 and its value is line 14, six lines apart in the text
 * and on the same visual row — y = 0.292 for both — with two other dates in
 * between. No window over the joined string recovers that; the geometry
 * recovers it exactly. Measured at +4.8pp of core precision.
 */

import type { OcrLine } from './types.ts';

/** A value and the lines it was read from. The one shape the cascade carries. */
export interface Found<T> {
  readonly value: T;
  /** Indexes into the input `lines` array, in reading order. */
  readonly lines: readonly number[];
}

export const centreY = (line: OcrLine): number => line.box.y + line.box.h / 2;
export const rightEdge = (line: OcrLine): number => line.box.x + line.box.w;

/**
 * Two lines are on the same visual row.
 *
 * Centres rather than tops, because a label in 8pt and its value in 12pt share a
 * row while their tops differ by the height difference. Scaled by the taller box
 * rather than a constant, because these coordinates are normalised 0–1 and a
 * fixed tolerance means a different number of pixels on every page. `max` rather
 * than `min` so a stray dot or a superscript cannot collapse the tolerance to
 * nothing.
 *
 * 0.6 is just over half a line height: adjacent rows sit roughly 1.0–1.5 heights
 * apart centre to centre, so this absorbs moderate skew without reaching the row
 * above. It is the constant most worth re-measuring if the corpus grows.
 */
export function sameRow(a: OcrLine, b: OcrLine): boolean {
  return Math.abs(centreY(a) - centreY(b)) <= Math.max(a.box.h, b.box.h) * 0.6;
}

/**
 * The index of the line most likely to hold the label's value.
 *
 * Returns an **index, not text**. The index is the one fact that cannot be
 * recovered later — searching the page for the returned string is ambiguous the
 * moment two lines match — and `sourceLineIndexes` is what lets Review highlight
 * the value on the photograph.
 *
 * Two strategies, strongest first, which is the cascade pattern one level down:
 * the nearest line to the right on the same row, then the nearest line below at
 * roughly the same left edge.
 */
export function valueIndexFor(
  lines: readonly OcrLine[],
  labelIndex: number,
): number | undefined {
  const label = lines[labelIndex];
  if (!label) return undefined;

  let best: { index: number; x: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || i === labelIndex) continue;
    if (!sameRow(label, line)) continue;
    // 0.01 of page width of slack absorbs box jitter around the label's edge.
    if (line.box.x < rightEdge(label) - 0.01) continue;
    if (best === undefined || line.box.x < best.x) best = { index: i, x: line.box.x };
  }
  if (best !== undefined) return best.index;

  let below: { index: number; y: number } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || i === labelIndex) continue;
    if (line.box.y <= label.box.y + label.box.h * 0.4) continue;
    if (line.box.y >= label.box.y + label.box.h * 3) continue;
    if (Math.abs(line.box.x - label.box.x) >= 0.08) continue;
    if (below === undefined || line.box.y < below.y) below = { index: i, y: line.box.y };
  }
  return below?.index;
}
