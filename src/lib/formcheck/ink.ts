/**
 * How much pen is inside a region of a photographed page.
 *
 * AUTHORSHIP: Claude. App-side, pure.
 *
 * The recogniser reads printed words well and pen marks badly: an X in a box
 * comes back as nothing, a tick as a stray "v", a signature as noise or not at
 * all. So the answer boxes and the signature line are judged by looking at the
 * pixels instead: what fraction of the region is clearly darker than the paper
 * around it.
 *
 * "The paper around it" is measured, not assumed, because the photo is not a
 * scan. Light falls off across the sheet, and a threshold fixed at 128 calls the
 * shaded corner of a blank page "ink". Each region is compared with the brightest
 * part of its own neighbourhood instead.
 */

import type { Point } from './homography.ts';

export interface GrayImage {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel, row-major, 0 black to 255 white. */
  readonly data: Uint8Array;
}

/** RGBA (as decoders produce it) to luminance. */
export function toGray(rgba: Uint8Array, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; p++, i += 4) {
    // Rec. 601 weights, in integers.
    data[p] = ((rgba[i] as number) * 77 + (rgba[i + 1] as number) * 150 + (rgba[i + 2] as number) * 29) >> 8;
  }
  return { width, height, data };
}

type Quad = readonly [Point, Point, Point, Point];

/** Shrink a quadrilateral towards its own centre: 1 keeps it, 0.5 halves it. */
export function insetQuad(quad: Quad, keep: number): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  return quad.map((p) => ({ x: cx + (p.x - cx) * keep, y: cy + (p.y - cy) * keep })) as unknown as Quad;
}

/** Point-in-convex-quad: the point is on the same side of all four edges. */
function inside(quad: Quad, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i] as Point;
    const b = quad[(i + 1) % 4] as Point;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/** Mean darkness (0 white, 1 black) of the pixels along a horizontal or vertical run. */
function runDarkness(image: GrayImage, x0: number, y0: number, x1: number, y1: number): number {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  let total = 0;
  let n = 0;
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    total += 255 - (image.data[y * image.width + x] as number);
    n++;
  }
  return n === 0 ? 0 : total / (n * 255);
}

function shift(quad: Quad, dx: number, dy: number): Quad {
  return quad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as unknown as Quad;
}

/**
 * Nudge a projected answer box onto the printed square it is meant to be.
 *
 * The page-wide alignment is good to a few pixels, and a few pixels is the whole
 * width of a box's printed border: measured on the photographed fixtures, an
 * empty box read as 15% ink because the border had slid into the area being
 * measured. So each box is re-registered locally, by trying every offset within
 * `radius` pixels and keeping the one where the four printed edges are darkest.
 * The same idea as the page alignment, at the scale of one box, using the box's
 * own ink as the anchor. Works in pixel coordinates.
 */
export function snapToPrintedBox(image: GrayImage, quad: Quad, radius: number): Quad {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const score =
        runDarkness(image, x0 + dx, y0 + dy, x1 + dx, y0 + dy) +
        runDarkness(image, x0 + dx, y1 + dy, x1 + dx, y1 + dy) +
        runDarkness(image, x0 + dx, y0 + dy, x0 + dx, y1 + dy) +
        runDarkness(image, x1 + dx, y0 + dy, x1 + dx, y1 + dy);
      if (score > best.score) best = { dx, dy, score };
    }
  }
  return shift(quad, best.dx, best.dy);
}

/**
 * Find the printed rule a writing area sits on, and move the area so it keeps
 * its designed gap above the rule actually found.
 *
 * The rule is ink. Measured on the photographed fixtures, a blank date line read
 * as "something written" because a few pixels of alignment error had pulled the
 * printed rule into the measured area. Searching for the rule and measuring
 * relative to it removes that, the same way `snapToPrintedBox` does for boxes.
 *
 * @param ruleY where the projection says the rule is, in pixels.
 */
export function aboveRule(image: GrayImage, quad: Quad, ruleY: number, radius: number): Quad {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const bottom = Math.max(...ys);
  const gap = Math.max(2, ruleY - bottom);
  let best = { y: ruleY, score: -1 };
  for (let y = Math.round(ruleY - radius); y <= Math.round(ruleY + radius); y++) {
    const score = runDarkness(image, x0, y, x1, y);
    if (score > best.score) best = { y, score };
  }
  return shift(quad, 0, best.y - gap - bottom);
}

export interface InkReading {
  /** Fraction of the region's pixels that are pen, 0-1. */
  readonly ratio: number;
  readonly pixels: number;
  /** Brightness taken as blank paper here. */
  readonly paper: number;
}

/**
 * Measure ink in `quad`, given in the image's own pixel coordinates.
 *
 * A pixel is ink when it is darker than 60% of the local paper brightness. The
 * paper brightness is the 90th percentile of an area three times the region's
 * size around it, which on any page with margins is white paper.
 */
export function inkIn(image: GrayImage, quad: Quad): InkReading {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) return { ratio: 0, pixels: 0, paper: 0 };

  // Neighbourhood for the paper estimate.
  const padX = x1 - x0;
  const padY = Math.max(y1 - y0, 12);
  const nx0 = Math.max(0, x0 - padX);
  const nx1 = Math.min(image.width - 1, x1 + padX);
  const ny0 = Math.max(0, y0 - padY);
  const ny1 = Math.min(image.height - 1, y1 + padY);
  const histogram = new Uint32Array(256);
  let counted = 0;
  const step = Math.max(1, Math.floor(((nx1 - nx0) * (ny1 - ny0)) / 40_000));
  for (let y = ny0; y <= ny1; y += step) {
    const row = y * image.width;
    for (let x = nx0; x <= nx1; x += step) {
      const v = image.data[row + x] as number;
      histogram[v] = (histogram[v] as number) + 1;
      counted++;
    }
  }
  let paper = 255;
  let seen = 0;
  const target = counted * 0.9;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v] as number;
    if (seen >= target) {
      paper = v;
      break;
    }
  }
  const cutoff = paper * 0.6;

  let ink = 0;
  let pixels = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * image.width;
    for (let x = x0; x <= x1; x++) {
      if (!inside(quad, x + 0.5, y + 0.5)) continue;
      pixels++;
      if ((image.data[row + x] as number) < cutoff) ink++;
    }
  }
  return { ratio: pixels === 0 ? 0 : ink / pixels, pixels, paper };
}
