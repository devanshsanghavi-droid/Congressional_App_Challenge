/**
 * Line up a photographed form with its blank template, using the printed words.
 *
 * AUTHORSHIP: Claude. App-side, pure.
 *
 * Every printed line on the blank form was read once, by the same recogniser the
 * phone uses, when the template was built. A photo of a filled-in copy is read
 * the same way. Lines that say the same thing in both are the same physical ink,
 * so their positions pair up: the left and right ends of each matched line give
 * two point pairs, and a few dozen pairs pin the page down (see homography.ts).
 *
 * The words are the anchors because they are the one thing on the page a pen
 * does not change. Answer boxes, signatures and dates all get written on; the
 * question text does not.
 */

import type { OcrBox, OcrLine } from '../ocr/types.ts';
import { applyHomography, ransacHomography } from './homography.ts';
import type { Correspondence, Homography, Point } from './homography.ts';

export interface Anchor {
  readonly text: string;
  readonly box: OcrBox;
}

/** Letters and digits, upper-cased: what is left of a line once the recogniser's spacing and dashes stop mattering. */
export function anchorKey(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Edit distance, two rows at a time. */
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min((current[j - 1] as number) + 1, (previous[j] as number) + 1, (previous[j - 1] as number) + cost));
    }
    previous = current;
  }
  return previous[b.length] as number;
}

/** 1 for identical keys, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  // Cheap reject first: lines of very different lengths are not the same line,
  // and the full edit distance on a 130-character paragraph line is not free.
  if (Math.abs(a.length - b.length) / longest > 0.25) return 0;
  return 1 - levenshtein(a, b) / longest;
}

export interface AnchorMatch {
  readonly anchor: Anchor;
  readonly line: OcrLine;
  readonly score: number;
}

/** Closer than this is "the same line". A recogniser misreading two characters of a 40-character line still clears it. */
export const MATCH_THRESHOLD = 0.82;

/**
 * Pair each anchor with at most one photo line and each photo line with at most
 * one anchor, best matches first. Anchors that share a key with another anchor
 * are dropped before matching, because a duplicate matches the wrong twin half
 * the time and RANSAC would have to clean up after it.
 */
export function matchAnchors(anchors: readonly Anchor[], lines: readonly OcrLine[]): AnchorMatch[] {
  const counts = new Map<string, number>();
  for (const a of anchors) counts.set(anchorKey(a.text), (counts.get(anchorKey(a.text)) ?? 0) + 1);
  const usable = anchors.filter((a) => anchorKey(a.text).length >= 8 && counts.get(anchorKey(a.text)) === 1);

  const lineKeys = lines.map((l) => anchorKey(l.text));
  const candidates: { a: number; l: number; score: number }[] = [];
  usable.forEach((anchor, a) => {
    const key = anchorKey(anchor.text);
    lineKeys.forEach((lineKey, l) => {
      const score = similarity(key, lineKey);
      if (score >= MATCH_THRESHOLD) candidates.push({ a, l, score });
    });
  });
  candidates.sort((x, y) => y.score - x.score);

  const usedAnchors = new Set<number>();
  const usedLines = new Set<number>();
  const matches: AnchorMatch[] = [];
  for (const c of candidates) {
    if (usedAnchors.has(c.a) || usedLines.has(c.l)) continue;
    usedAnchors.add(c.a);
    usedLines.add(c.l);
    matches.push({ anchor: usable[c.a] as Anchor, line: lines[c.l] as OcrLine, score: c.score });
  }
  return matches;
}

const leftMid = (b: OcrBox): Point => ({ x: b.x, y: b.y + b.h / 2 });
const rightMid = (b: OcrBox): Point => ({ x: b.x + b.w, y: b.y + b.h / 2 });
export const centre = (b: OcrBox): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export type Alignment =
  | {
      readonly ok: true;
      /** Template (0-1 of the blank page) to photo (0-1 of the photo). */
      readonly h: Homography;
      readonly matches: readonly AnchorMatch[];
      /** How many matched lines the final fit agrees with. */
      readonly agreeingLines: number;
    }
  | { readonly ok: false; readonly reason: 'too_few_lines' | 'no_agreement'; readonly matches: readonly AnchorMatch[] };

/** Fewest agreeing lines before an alignment is trusted. Four is the mathematical minimum; six leaves room for one to be wrong. */
export const MIN_AGREEING_LINES = 6;

/**
 * @param photoAspect height / width of the photo, so an error is measured in the
 *   same units across and down the page.
 */
export function alignToTemplate(
  anchors: readonly Anchor[],
  lines: readonly OcrLine[],
  photoAspect: number,
): Alignment {
  const matches = matchAnchors(anchors, lines);
  if (matches.length < MIN_AGREEING_LINES) return { ok: false, reason: 'too_few_lines', matches };

  const pairs: Correspondence[] = [];
  matches.forEach((m, group) => {
    pairs.push({ from: leftMid(m.anchor.box), to: leftMid(m.line.box), group });
    pairs.push({ from: rightMid(m.anchor.box), to: rightMid(m.line.box), group });
  });

  const fit = ransacHomography(pairs, {
    iterations: 400,
    // About 1.2% of the photo's width: ~20 px at the 1700 px the recogniser
    // reads. Line ends move that much from spacing alone; a wrong match moves
    // by whole lines.
    threshold: 0.012,
    minGroups: MIN_AGREEING_LINES,
    yScale: photoAspect,
    seed: 7,
  });
  if (!fit) return { ok: false, reason: 'no_agreement', matches };
  return { ok: true, h: fit.h, matches, agreeingLines: fit.groups };
}

/** A template box's four corners, carried into the photo. Clockwise from top-left. */
export function projectBox(h: Homography, box: OcrBox): readonly [Point, Point, Point, Point] {
  return [
    applyHomography(h, { x: box.x, y: box.y }),
    applyHomography(h, { x: box.x + box.w, y: box.y }),
    applyHomography(h, { x: box.x + box.w, y: box.y + box.h }),
    applyHomography(h, { x: box.x, y: box.y + box.h }),
  ];
}
