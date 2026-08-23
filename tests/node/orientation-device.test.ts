/**
 * The orientation detector against real iPhone camera captures.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * Separate from `orientation.test.ts`, which runs on the scored corpus. These
 * are `tools/corpus/device-photos/` — shot 2026-08-21 on the stock Camera app,
 * HEIC, unedited — and they are a **fixture, not a corpus addition**. Nothing
 * here feeds an accuracy table.
 *
 * They matter because every earlier inverted test was compromised in one of two
 * ways: the single corpus capture was the one the 0.5 threshold was *derived*
 * from, so it cannot validate it; and the synthetic EXIF fixture was silently
 * corrected by `expo-image-manipulator` before the detector ran, so the
 * detector saw an upright page and agreed it was upright — testing nothing.
 *
 * `device-inverted.heic` is the clean case: EXIF orientation 1, phone held
 * level, paper turned. No tag to correct, so the detector is the only thing
 * standing between an upside-down page and silently halved extraction.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkOrientation, shouldWarnUpsideDown } from '../../src/lib/ocr/orientation.ts';
import type { OcrLine } from '../../src/lib/ocr/types.ts';
import { CORPUS_DIR } from '../../tools/metrics/corpus.ts';

/** Sorted geometrically, the way `expo-mlkit-ocr` returns lines to the app. */
function linesAsAppSeesThem(file: string): OcrLine[] {
  const raw = readFileSync(join(CORPUS_DIR, 'device-photos/ocr', `${file}.json`), 'utf8');
  const record = JSON.parse(raw) as { lines: OcrLine[] };
  return [...record.lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

const UPRIGHT = ['device-upright.heic', 'device-dim-angled-upright.heic'];
const INVERTED = ['device-inverted.heic', 'device-inverted-angled.heic'];

describe('real camera captures, upright', () => {
  it.each(UPRIGHT)('does not warn on %s', (file) => {
    // A false warning is worse than a missed one: it teaches the user to ignore
    // the warning. Both of these are deliberately bad captures — one a heavy
    // magenta LED cast, one dim and angled — because that is where a false
    // positive would come from.
    const check = checkOrientation(linesAsAppSeesThem(file));
    expect(check.orientation).toBe('upright');
    expect(shouldWarnUpsideDown(check)).toBe(false);
  });
});

describe('real camera captures, inverted', () => {
  it.each(INVERTED)('warns on %s', (file) => {
    const check = checkOrientation(linesAsAppSeesThem(file));
    expect(check.orientation).toBe('inverted');
    expect(shouldWarnUpsideDown(check)).toBe(true);
  });
});

describe('the margin around the 0.5 threshold', () => {
  const positions = (files: readonly string[]): number[] =>
    files
      .map((f) => checkOrientation(linesAsAppSeesThem(f)).anchorPosition)
      .filter((p): p is number => p !== undefined);

  it('keeps real upright captures clear of the threshold', () => {
    // Measured 2026-08-21: 0.249 flat, 0.385 dim and angled. The skewed one is
    // the closer of the two, and skew is what pushes an upright anchor upward —
    // so this bound is the one that would fail first, and it is asserted at the
    // measured value rather than at the threshold.
    const upright = positions(UPRIGHT);
    expect(Math.max(...upright)).toBeLessThan(0.45);
  });

  it('keeps real inverted captures clear of the threshold', () => {
    // Measured: 0.651 skewed, 0.757 flat.
    expect(Math.min(...positions(INVERTED))).toBeGreaterThan(0.6);
  });

  it('leaves a usable gap between the two populations', () => {
    // 0.385 to 0.651 on real camera input. Narrower than the corpus suggested
    // (0.32 to 0.65) because skew compresses it from both sides — if this drops
    // below about 0.15, widen the anchor set rather than moving the threshold,
    // which would be fitting to whichever photograph was taken last.
    const gap = Math.min(...positions(INVERTED)) - Math.max(...positions(UPRIGHT));
    expect(gap).toBeGreaterThan(0.15);
  });
});
