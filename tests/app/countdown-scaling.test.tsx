/**
 * The countdown is the one place in Carta that caps Dynamic Type. Prove it
 * stays capped, and prove nothing else starts.
 *
 * AUTHORSHIP: Claude. App-side tests.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS GUARDING
 * ---------------------------------------------------------------------------
 * Found on an erased Simulator, 2026-08-25, at the largest accessibility text
 * size. The 72pt countdown scaled uncapped to roughly 220pt; the card alone
 * became ~600pt of an 874pt screen and the programme name — "CalFresh/CalWORKs",
 * the text that says *which* notice this is — was pushed off the bottom.
 *
 * The failure is invisible at the default text size, which is the only size
 * anyone tests at by accident. It is also invisible to every other check in
 * this repo: it typechecks, it lints, it renders, and `screens.test.tsx` asserts
 * the right tier and the right number. Nothing looks at how big any of it gets.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ASSERTIONS ARE SHAPED LIKE THIS
 * ---------------------------------------------------------------------------
 * A test that hardcoded `1.6` would pass forever while someone quietly changed
 * the constant to 6. So the caps are imported from the component and asserted
 * against two things that are *independently* true:
 *
 *   - a bound (the number may not grow more than ~2x, or it eats the viewport
 *     again — the defect this file exists for), and
 *   - an ordering (the number's cap is tighter than the word's, because the
 *     number is glanced at and the word is read).
 *
 * And the last block asserts the *converse* — that prose is NOT capped —
 * because "fix the accessibility bug" has an obvious wrong fix: cap everything.
 * That would make the app pass a screenshot review and fail the user it is for.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import '../../src/lib/i18n';
import {
  Countdown,
  NUMBER_MAX_SCALE,
  WORD_MAX_SCALE,
} from '../../src/components/Countdown';
import type { NoticeDates } from '../../src/lib/urgency';

// 2026-08-25T12:00:00 local. Fixed so the tier never depends on the clock.
const NOW = new Date(2026, 7, 25, 12, 0, 0).getTime();
const IN_11_DAYS = new Date(2026, 8, 5, 12, 0, 0).getTime();

/** The SAR 7 case: a recertification is due, which is what Home renders. */
const DUE_IN_11: NoticeDates = { actionType: 'recert_due', deadlineDate: IN_11_DAYS };

describe('the countdown caps how far it will scale', () => {
  it('caps the number well short of the size that pushed the notice name off screen', () => {
    // 72pt base. At 3.1x (AX5, uncapped) this reached ~220pt and the card
    // filled the screen. Anything at or above 2x reproduces that class of bug.
    expect(NUMBER_MAX_SCALE).toBeGreaterThan(1);
    expect(NUMBER_MAX_SCALE).toBeLessThan(2);
  });

  it('lets the word grow further than the number, because the word is read', () => {
    // The ordering is the design decision, not the two magic numbers. A glanced
    // -at number needs less growth than a word someone actually reads.
    expect(WORD_MAX_SCALE).toBeGreaterThan(NUMBER_MAX_SCALE);
    expect(WORD_MAX_SCALE).toBeLessThanOrEqual(2);
  });

  it('applies the number cap to the rendered number', async () => {
    await render(<Countdown dates={DUE_IN_11} nowMs={NOW} />);
    // `includeHiddenElements` because the number is deliberately hidden from the
    // accessibility tree — the wrapping View carries one combined label so a
    // screen reader says "11 days left" rather than "11" then "days left".
    const number = screen.getByText('11', { includeHiddenElements: true });
    expect(number.props.maxFontSizeMultiplier).toBe(NUMBER_MAX_SCALE);
  });

  it('applies the word cap to the rendered word', async () => {
    await render(<Countdown dates={DUE_IN_11} nowMs={NOW} />);
    const word = screen.getByText('days left', { includeHiddenElements: true });
    expect(word.props.maxFontSizeMultiplier).toBe(WORD_MAX_SCALE);
  });

  /**
   * The three states that replace the number entirely. Each is a separate early
   * return in the component, so each can be missed independently — and "Due
   * today" is the highest-stakes string the countdown ever renders.
   */
  it.each([
    ['due today', { actionType: 'recert_due', deadlineDate: NOW }, 'Due today'],
    [
      'past due',
      { actionType: 'recert_due', deadlineDate: new Date(2026, 7, 1).getTime() },
      'The date has passed',
    ],
    ['no deadline', { actionType: 'recert_due' }, 'No deadline'],
  ] satisfies [string, NoticeDates, string][])(
    'caps the %s state too',
    async (_name, dates, text) => {
      await render(<Countdown dates={dates} nowMs={NOW} />);
      expect(screen.getByText(text).props.maxFontSizeMultiplier).toBe(WORD_MAX_SCALE);
    },
  );

  it('caps the compact variant as well as the large one', async () => {
    await render(
      <Countdown dates={DUE_IN_11} nowMs={NOW} size="compact" />,
    );
    expect(
      screen.getByText('11', { includeHiddenElements: true }).props.maxFontSizeMultiplier,
    ).toBe(NUMBER_MAX_SCALE);
  });
});

describe('nothing outside the countdown caps Dynamic Type', () => {
  /**
   * The converse guard. Capping prose is the obvious wrong fix for the bug
   * above: it makes every screenshot look tidy and it takes away the scaling
   * from the user who needs it most. `maxFontSizeMultiplier` and
   * `allowFontScaling={false}` are therefore banned everywhere except this one
   * component, and that is checked against the bytes on disk.
   */
  const { readFileSync, readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  /**
   * Comments are not code. `tokens.ts` documents this very rule in prose and
   * names both banned patterns while using neither — scanning raw bytes flags
   * it, which would train everyone to add exemptions instead of reading the
   * finding. Strip comments and string literals first.
   */
  function strippedSource(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
  }

  function tsxFilesUnder(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsxFilesUnder(full, out);
      else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  const SRC = join(__dirname, '..', '..', 'src');
  // The dev-only benchmark screen is deleted before freeze (CLAUDE.md §7) and
  // is never seen by a user.
  const EXEMPT = ['components/Countdown.tsx', 'app/bench.tsx'];

  it('finds files to check, so a pass is not vacuous', () => {
    expect(tsxFilesUnder(SRC).length).toBeGreaterThan(15);
  });

  it.each([
    ['maxFontSizeMultiplier', /maxFontSizeMultiplier/],
    ['allowFontScaling={false}', /allowFontScaling\s*=\s*\{\s*false\s*\}/],
  ])('no file outside the countdown uses %s', (_what, pattern) => {
    const offenders = tsxFilesUnder(SRC)
      .filter((f) => !EXEMPT.some((e) => f.endsWith(e)))
      .filter((f) => pattern.test(strippedSource(f)))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it('the exemption is real — the countdown does use the cap', () => {
    // Guards the failure where the audit passes because the pattern is wrong.
    const source = readFileSync(join(SRC, 'components', 'Countdown.tsx'), 'utf8');
    expect(/maxFontSizeMultiplier/.test(source)).toBe(true);
  });
});
