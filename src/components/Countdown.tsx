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
 */

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { color, space, tone, type } from '@/lib/theme/tokens';
import type { CountdownTone } from '@/lib/theme/tokens';
import { countdownDate, countdownTier, daysUntil } from '@/lib/urgency';
import type { NoticeDates } from '@/lib/urgency';

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
    return (
      <View
        style={[styles.wrap, big ? styles.wrapLarge : styles.wrapCompact]}
        accessibilityRole="text"
        accessibilityLabel={t('notice.noDeadline')}
      >
        <Text style={[styles.word, { color: palette.fg }]}>{t('notice.noDeadline')}</Text>
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
        <Text style={[styles.word, { color: palette.fg }]}>{t('notice.overdue')}</Text>
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
        <Text style={[big ? styles.todayLarge : styles.word, { color: palette.fg }]}>
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
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {days}
      </Text>
      <Text
        style={[big ? styles.word : styles.wordCompact, { color: palette.fg }]}
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
  wrapLarge: { paddingVertical: space.lg, paddingHorizontal: space.lg, gap: 0 },
  wrapCompact: { paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },

  numberLarge: { ...type.countdown, lineHeight: 78 },
  numberCompact: { fontSize: 34, fontWeight: '800', lineHeight: 38, letterSpacing: -1 },

  word: { ...type.countdownWord },
  wordCompact: { ...type.label, color: color.text },
  todayLarge: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
});
