/**
 * The upside-down check, run against the real corpus.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * This is the one capture-quality check that earns its place with a number:
 * `na960x-angled-08.jpg` reads at 0.978 confidence with all nine printed fields
 * in the text, and deterministic extraction scores 4 of 9 on it. Nothing else
 * in the pipeline notices. So the detector is tested on all 23 real captures,
 * not on fixtures — if a change makes it fire on an upright page, that fails
 * here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkOrientation, shouldWarnUpsideDown } from '../../src/lib/ocr/orientation.ts';
import type { OcrLine } from '../../src/lib/ocr/types.ts';
import { REAL_CAPTURES, CORPUS_DIR } from '../../tools/metrics/corpus.ts';

/**
 * Load a cached capture the way the app would see it: `expo-mlkit-ocr` sorts
 * lines geometrically before returning them, so the test sorts too. Skipping
 * this would test a signal the app never gets.
 */
function linesAsAppSeesThem(file: string): OcrLine[] {
  const raw = readFileSync(join(CORPUS_DIR, 'ocr/apple-vision', `${file}.json`), 'utf8');
  const record = JSON.parse(raw) as { lines: OcrLine[] };
  return [...record.lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

const inverted = REAL_CAPTURES.filter((c) => c.condition === 'inverted');
const upright = REAL_CAPTURES.filter((c) => c.condition !== 'inverted');

describe('upside-down detection on the real corpus', () => {
  it('has an inverted capture to test against at all', () => {
    // If the corpus loses its one inverted capture this suite silently becomes
    // "never warns", which would pass forever while testing nothing.
    expect(inverted).toHaveLength(1);
    expect(inverted[0]?.file).toBe('na960x-angled-08.jpg');
  });

  it.each(inverted.map((c) => c.file))('warns on %s', (file) => {
    const check = checkOrientation(linesAsAppSeesThem(file));
    expect(check.orientation).toBe('inverted');
    expect(shouldWarnUpsideDown(check)).toBe(true);
  });

  it.each(upright.map((c) => [c.file, c.condition]))(
    'stays quiet on %s (%s)',
    (file) => {
      const check = checkOrientation(linesAsAppSeesThem(file as string));
      expect(check.orientation).toBe('upright');
      expect(shouldWarnUpsideDown(check)).toBe(false);
    },
  );

  it('keeps a wide margin between the two populations', () => {
    // The threshold is 0.5. Assert the gap rather than just the verdicts, so a
    // change that moves everything close to the line fails here rather than
    // becoming a flaky warning on a user's kitchen table.
    const uprightPositions = upright
      .map((c) => checkOrientation(linesAsAppSeesThem(c.file)).anchorPosition)
      .filter((p): p is number => p !== undefined);
    const invertedPositions = inverted
      .map((c) => checkOrientation(linesAsAppSeesThem(c.file)).anchorPosition)
      .filter((p): p is number => p !== undefined);

    expect(Math.max(...uprightPositions)).toBeLessThan(0.4);
    expect(Math.min(...invertedPositions)).toBeGreaterThan(0.6);
  });
});

describe('it declines to guess rather than warning wrongly', () => {
  const line = (text: string, y: number): OcrLine => ({
    text,
    confidence: 1,
    box: { x: 0.1, y, w: 0.3, h: 0.02 },
  });

  it('says nothing when there is too little text', () => {
    expect(checkOrientation([line('SAN JOSE, CA 95122', 0.9)]).orientation).toBe('unknown');
  });

  it('says nothing when no anchor is present', () => {
    // An unfamiliar letter with no address block and no case number. A false
    // "turn your phone around" teaches the user to ignore the warning, which is
    // worse than never showing it.
    const lines = Array.from({ length: 12 }, (_, i) => line(`some text ${i}`, i / 12));
    expect(checkOrientation(lines).orientation).toBe('unknown');
    expect(shouldWarnUpsideDown(checkOrientation(lines))).toBe(false);
  });

  it('ignores a sender address in the footer', () => {
    // The state hearings PO box is the one address that points the wrong way.
    // On the real inverted capture, a naive version matched exactly this line.
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => line(`body ${i}`, 0.2 + i / 40)),
      line('P.O. Box 944243, MS 09-17-37, Sacramento, CA 94244-2430', 0.95),
    ];
    expect(checkOrientation(lines).anchorCount).toBe(0);
    expect(checkOrientation(lines).orientation).toBe('unknown');
  });

  it('warns when the recipient block is in the bottom half', () => {
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => line(`body ${i}`, 0.05 + i / 40)),
      line('Case Number: 01-4472-9931', 0.82),
      line('SAN JOSE, CA 95122', 0.86),
    ];
    expect(checkOrientation(lines).orientation).toBe('inverted');
  });
});
