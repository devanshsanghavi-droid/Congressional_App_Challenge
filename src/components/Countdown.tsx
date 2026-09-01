/**
 * The countdown. The most important thing Carta draws.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * SPEC §7: "If a stranger sees this screen for two seconds they should come
 * away with a number and a colour." So the number is enormous, the word under
 * it is small, and nothing else on the card competes.
 *
 * Colour is never the only carrier. Every tier renders a number and a word as
 * well as a hue, because a red that reads as grey to a colour-blind user still
 * has to say "2 days left" — and because this is the screen the whole product
 * is judged on, in a video, at a glance.
 *
 * The tier thresholds live in `urgency.ts` and are shared with the scheduler,
 * so the colour on screen and the day a reminder fires can never disagree.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE ONE PLACE THAT CAPS DYNAMIC TYPE
 * ---------------------------------------------------------------------------
 * Measured on an erased Simulator, 2026-08-25. At the largest accessibility
 * size the uncapped 72pt number scaled to roughly 220pt and the card alone
 * became ~600pt of an 874pt screen. The programme name — the text that says
 * *which* notice this is — was pushed off the bottom. A user at AX5 saw a
 * gigantic number and no way to tell what it counted down to.
 *
 * That is Dynamic Type harming the person it exists to serve, so the number
 * and its word are capped and **nothing else in the app is**:
 *
 *   - Dynamic Type exists so text can be *read*. The countdown is already 72pt,
 *     four times body size. It was never the thing that was hard to read.
 *   - Prose is different: at AX5 a 17pt sentence genuinely needs to become a
 *     53pt sentence, and it may take as many lines as it needs. Body text,
 *     labels and the programme name are never capped.
 *   - So the rule is: **cap display type, never cap prose.** This component is
 *     the only display type in Carta, and `tests/app/countdown-scaling.test.tsx`
 *     asserts the caps are here and that the word stays subordinate.
 *
 * The caps are multipliers, not sizes — a capped countdown still grows, just
 * not without bound. At `NUMBER_MAX_SCALE` the number is ~115pt, which keeps
 * SPEC §7's "a number and a colour in two seconds" while leaving the notice's
 * identity on screen.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { color, radius, space, tone, type } from '@/lib/theme/tokens';
import type { CountdownTone } from '@/lib/theme/tokens';
import { countdownDate, countdownTier, daysUntil } from '@/lib/urgency';
import type { NoticeDates } from '@/lib/urgency';

/**
 * How far the big number may grow. ~115pt at 72pt base.
 *
 * Exported so the test can assert the value that is actually applied rather
 * than a copy of it.
 */
export const NUMBER_MAX_SCALE = 1.6;

/**
 * The word under the number ("days left") and the short states that replace the
 * number entirely ("Due today", "Past due", "No date yet"). These are read, not
 * glanced at, so they get more room than the number — but they still must not
 * push the programme name off the card.
 */
export const WORD_MAX_SCALE = 2;

const TIER_TONE: Record<ReturnType<typeof countdownTier>, CountdownTone> = {
  green: 'green',
  amber: 'amber',
  red: 'red',
  expired: 'neutral',
  none: 'neutral',
};

export type CountdownSize = 'large' | 'compact';

export function Countdown({
  dates,
  nowMs,
  size = 'large',
}: {
  dates: NoticeDates;
  nowMs: number;
  size?: CountdownSize;
}) {
  const { t } = useTranslation();
  const tier = countdownTier(dates, nowMs);
  const target = countdownDate(dates);
  const palette = tone[TIER_TONE[tier]];
  const big = size === 'large';

  // No date to count down to. Says so plainly rather than showing a zero, which
  // would read as "due today" — the most dangerous possible misreading.
  if (target === undefined) {
    // A status, not a countdown — so it is sized like one.
    //
    // This used to take `wrapLarge`, which is padding built around a 72pt
    // number. With two small words in it the approval card carried a tall empty
    // rectangle and read as a card that had failed to load. There is no
    // deadline here and nothing to dominate with: a chip states the fact and
    // gives the programme name back the top of the card.
    return (
      <View
        style={[styles.wrap, styles.noDeadline, { backgroundColor: palette.bg }]}
        accessibilityRole="text"
        accessibilityLabel={t('notice.noDeadline')}
      >
        <Text style={[styles.word, { color: palette.fg }]} maxFontSizeMultiplier={WORD_MAX_SCALE}>
          {t('notice.noDeadline')}
        </Text>
      </View>
    );
  }

  const days = daysUntil(target, nowMs);

  if (days < 0) {
    return (
      <View
        style={[styles.wrap, big ? styles.wrapLarge : styles.wrapCompact, { backgroundColor: palette.bg }]}
        accessibilityRole="text"
        accessibilityLabel={t('notice.overdue')}
      >
        <Text style={[styles.word, { color: palette.fg }]} maxFontSizeMultiplier={WORD_MAX_SCALE}>
          {t('notice.overdue')}
        </Text>
      </View>
    );
  }

  if (days === 0) {
    return (
      <View
        style={[styles.wrap, big ? styles.wrapLarge : styles.wrapCompact, { backgroundColor: palette.bg }]}
        accessibilityRole="text"
        accessibilityLabel={t('notice.dueToday')}
      >
        <Text
          style={[big ? styles.todayLarge : styles.word, { color: palette.fg }]}
          maxFontSizeMultiplier={WORD_MAX_SCALE}
        >
          {t('notice.dueToday')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.wrap, big ? styles.wrapLarge : styles.wrapCompact, { backgroundColor: palette.bg }]}
      accessibilityRole="text"
      // One label for the whole thing: a screen reader should say "12 days
      // left", not "12" then "days left" as two separate stops.
      accessibilityLabel={t('notice.daysLeft', { count: days })}
    >
      <Text
        style={[big ? styles.numberLarge : styles.numberCompact, { color: palette.fg }]}
        maxFontSizeMultiplier={NUMBER_MAX_SCALE}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {days}
      </Text>
      <Text
        style={[big ? styles.word : styles.wordCompact, { color: palette.fg }]}
        maxFontSizeMultiplier={WORD_MAX_SCALE}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {t('notice.daysLeftWord', { count: days })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', justifyContent: 'center', borderRadius: 12 },
  /** Chip-sized. Only ever holds two words, so it is padded for two words. */
  noDeadline: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  wrapLarge: { paddingVertical: space.lg, paddingHorizontal: space.lg, gap: 0 },
  wrapCompact: { paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },

  numberLarge: { ...type.countdown, lineHeight: 78 },
  numberCompact: { fontSize: 34, fontWeight: '800', lineHeight: 38, letterSpacing: -1 },

  word: { ...type.countdownWord },
  wordCompact: { ...type.label, color: color.text },
  todayLarge: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
});
