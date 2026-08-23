/**
 * The text layer, as everything downstream sees it.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Deliberately identical in shape to what the metrics harness feeds the
 * extraction cascade in bare Node. That is the whole point: the cascade must
 * run unchanged on the phone and against the golden corpus (CLAUDE.md §8), so
 * the two callers have to hand it the same thing. Boxes are **normalised to
 * 0–1 with a top-left origin** on both sides.
 *
 * `expo-mlkit-ocr` returns boxes in image pixels, so the adapter divides.
 * Normalised rather than pixels because the extraction cascade reasons about
 * relative position ("the value to the right of this label") and must not care
 * whether the photo was 1700px or 4032px wide.
 */

export interface OcrBox {
  /** Left edge, 0–1 across the image width. */
  readonly x: number;
  /** Top edge, 0–1 down the image height. */
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface OcrLine {
  readonly text: string;
  /** 0–1. ML Kit does not report per-line confidence, so it is 1 there. */
  readonly confidence: number;
  readonly box: OcrBox;
}

export interface OcrResult {
  readonly lines: readonly OcrLine[];
  /** The lines joined, in the order the recogniser returned them. */
  readonly text: string;
  /** Pixel dimensions the boxes were normalised against. */
  readonly width: number;
  readonly height: number;
  /** Which engine produced this, carried through for the metrics table. */
  readonly engine: string;
}
