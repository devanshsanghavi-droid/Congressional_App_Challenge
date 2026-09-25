/**
 * Plane-to-plane mapping between a blank form and a photograph of it.
 *
 * AUTHORSHIP: Claude. App-side, pure (runs unchanged in bare Node for tests).
 *
 * A sheet of paper photographed at an angle is still a plane, and any two views
 * of a plane are related by a homography: a 3x3 matrix H that sends a point on
 * the blank form to where that same point appears in the photo. Once H is known,
 * every answer box, every signature line and every date line on the template can
 * be located in the photo, including the ones with no printed text of their own.
 *
 * Two pieces:
 *
 *   - **Direct linear transform (DLT)** fits H to four or more point pairs by
 *     least squares, after Hartley normalisation (centre each point set, scale it
 *     to an average distance of sqrt(2)). Without the normalisation the normal
 *     equations mix values near 1 with values near 1e-6 and the solve loses most
 *     of its precision.
 *
 *   - **RANSAC** makes that fit survive mistakes. Some of the "same line" pairs
 *     handed in will be wrong: a label the recogniser misread, a line it merged
 *     with its neighbour. A least-squares fit over everything lets one bad pair
 *     drag the whole page sideways. RANSAC instead fits many small random
 *     subsets, keeps the H that the most pairs agree with, and refits on only
 *     those. The randomness is seeded, so the same photo always gives the same
 *     answer, which is what lets a test pin it.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Row-major 3x3, with h33 fixed at 1. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/** One point pair. `group` ties together pairs taken from the same source (one text line). */
export interface Correspondence {
  readonly from: Point;
  readonly to: Point;
  readonly group: number;
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

function multiply(a: Homography, b: Homography): Homography {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r.push((a[i * 3] as number) * (b[j] as number) + (a[i * 3 + 1] as number) * (b[3 + j] as number) + (a[i * 3 + 2] as number) * (b[6 + j] as number));
    }
  }
  return r as unknown as Homography;
}

/** The similarity transform Hartley normalisation applies, and its inverse. */
function normaliser(points: readonly Point[]): { t: Homography; inverse: Homography } {
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  let spread = 0;
  for (const p of points) spread += Math.hypot(p.x - cx, p.y - cy);
  spread /= points.length;
  const s = spread > 0 ? Math.SQRT2 / spread : 1;
  return {
    t: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1],
    inverse: [1 / s, 0, cx, 0, 1 / s, cy, 0, 0, 1],
  };
}

/**
 * Solve the n x n system in place by Gaussian elimination with partial pivoting.
 * Returns undefined for a singular (or numerically near-singular) system, which
 * is what four collinear points produce.
 */
function solveLinear(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs((a[row] as number[])[col] as number) > Math.abs((a[pivot] as number[])[col] as number)) pivot = row;
    }
    const pivotValue = (a[pivot] as number[])[col] as number;
    if (Math.abs(pivotValue) < 1e-12) return undefined;
    [a[col], a[pivot]] = [a[pivot] as number[], a[col] as number[]];
    [b[col], b[pivot]] = [b[pivot] as number, b[col] as number];
    const pivotRow = a[col] as number[];
    for (let row = col + 1; row < n; row++) {
      const target = a[row] as number[];
      const factor = (target[col] as number) / (pivotRow[col] as number);
      if (factor === 0) continue;
      for (let k = col; k < n; k++) target[k] = (target[k] as number) - factor * (pivotRow[k] as number);
      b[row] = (b[row] as number) - factor * (b[col] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    const r = a[row] as number[];
    let sum = b[row] as number;
    for (let k = row + 1; k < n; k++) sum -= (r[k] as number) * (x[k] as number);
    x[row] = sum / (r[row] as number);
  }
  return x;
}

/**
 * Least-squares homography from `from` to `to` (both at least four points).
 * Undefined when the points do not determine one: fewer than four, or a
 * degenerate arrangement such as three of the four on a line.
 */
export function fitHomography(from: readonly Point[], to: readonly Point[]): Homography | undefined {
  if (from.length < 4 || from.length !== to.length) return undefined;
  const nf = normaliser(from);
  const nt = normaliser(to);

  // Normal equations for the 8 unknowns: (A^T A) h = A^T b.
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const accumulate = (row: readonly number[], rhs: number): void => {
    for (let i = 0; i < 8; i++) {
      const ri = row[i] as number;
      if (ri === 0) continue;
      atb[i] = (atb[i] as number) + ri * rhs;
      const target = ata[i] as number[];
      for (let j = 0; j < 8; j++) target[j] = (target[j] as number) + ri * (row[j] as number);
    }
  };
  for (let i = 0; i < from.length; i++) {
    const p = applyHomography(nf.t, from[i] as Point);
    const q = applyHomography(nt.t, to[i] as Point);
    accumulate([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x], q.x);
    accumulate([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y], q.y);
  }
  const h = solveLinear(ata, atb);
  if (!h || h.some((v) => !Number.isFinite(v))) return undefined;

  const normalised = [...h, 1] as unknown as Homography;
  // Undo both normalisations: H = T_to^-1 * Hn * T_from.
  const full = multiply(multiply(nt.inverse, normalised), nf.t);
  const scale = full[8];
  if (!Number.isFinite(scale) || Math.abs(scale) < 1e-12) return undefined;
  return full.map((v) => v / scale) as unknown as Homography;
}

/** A tiny seeded PRNG (mulberry32): the same photo must always align the same way. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RansacOptions {
  readonly iterations: number;
  /** Largest reprojection error, in `to` units, for a pair to count as agreeing. */
  readonly threshold: number;
  /** Fewest distinct groups (lines) that must agree before an answer is trusted. */
  readonly minGroups: number;
  /** Multiplies the y error before measuring, for non-square normalised spaces. */
  readonly yScale?: number;
  readonly seed?: number;
}

export interface RansacResult {
  readonly h: Homography;
  /** Indexes into the correspondences that agree with `h`. */
  readonly inliers: readonly number[];
  /** Distinct groups among the inliers. */
  readonly groups: number;
}

function error(h: Homography, c: Correspondence, yScale: number): number {
  const p = applyHomography(h, c.from);
  return Math.hypot(p.x - c.to.x, (p.y - c.to.y) * yScale);
}

/**
 * Robustly fit H. Each hypothesis is built from four pairs drawn from four
 * DIFFERENT groups, because two points on one text line say almost nothing about
 * vertical perspective.
 */
export function ransacHomography(pairs: readonly Correspondence[], options: RansacOptions): RansacResult | undefined {
  const yScale = options.yScale ?? 1;
  const byGroup = new Map<number, number[]>();
  pairs.forEach((c, i) => {
    const list = byGroup.get(c.group) ?? [];
    list.push(i);
    byGroup.set(c.group, list);
  });
  const groups = [...byGroup.keys()];
  if (groups.length < Math.max(4, options.minGroups)) return undefined;

  const next = random(options.seed ?? 1);
  let best: { inliers: number[]; groups: number } | undefined;

  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const chosen = new Set<number>();
    while (chosen.size < 4) chosen.add(groups[Math.floor(next() * groups.length)] as number);
    const sample = [...chosen].map((g) => {
      const members = byGroup.get(g) as number[];
      return pairs[members[Math.floor(next() * members.length)] as number] as Correspondence;
    });
    const h = fitHomography(sample.map((c) => c.from), sample.map((c) => c.to));
    if (!h) continue;

    const inliers: number[] = [];
    pairs.forEach((c, i) => {
      if (error(h, c, yScale) <= options.threshold) inliers.push(i);
    });
    const distinct = new Set(inliers.map((i) => (pairs[i] as Correspondence).group)).size;
    if (!best || distinct > best.groups || (distinct === best.groups && inliers.length > best.inliers.length)) {
      best = { inliers, groups: distinct };
    }
  }

  if (!best || best.groups < options.minGroups) return undefined;

  // Refit on every agreeing pair, then take the agreement again under the refit.
  const agreeing = best.inliers.map((i) => pairs[i] as Correspondence);
  const refit = fitHomography(agreeing.map((c) => c.from), agreeing.map((c) => c.to));
  if (!refit) return undefined;
  const inliers: number[] = [];
  pairs.forEach((c, i) => {
    if (error(refit, c, yScale) <= options.threshold) inliers.push(i);
  });
  const distinct = new Set(inliers.map((i) => (pairs[i] as Correspondence).group)).size;
  if (distinct < options.minGroups) return undefined;
  return { h: refit, inliers, groups: distinct };
}
