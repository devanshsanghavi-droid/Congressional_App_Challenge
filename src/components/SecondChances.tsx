/**
 * "If your benefits stop": the ways back that a letter implies but does not print.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * A discontinuance notice states the stop date. The rules in
 * `content/timelines.json` state the window after it: CalFresh can restart if the
 * missing form comes in within 30 days, Medi-Cal picks up with no gap if the
 * renewal comes back within 90. Carta joins the two, and this section shows the
 * result, one card per date.
 *
 * Three rules shape it, all from CLAUDE.md:
 *
 *   - **Nothing here is scheduled on its own.** These dates are worked out, not
 *     printed, so the person reads the date, the condition and "ask your county
 *     to confirm" first, and a reminder exists only if they tap for one (§3
 *     rule 6, applied to a date the app derived).
 *   - **Every date shows where it comes from**, word for word, with the source
 *     and the day it was checked (§16). One tap, on this screen.
 *   - **It renders nothing** when no rule applies. An empty "If your benefits
 *     stop" heading on an approval letter would read as a threat.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Divider, Muted, Section, Sheet } from '@/components/ui';
import { loadTimelines } from '@/lib/content';
import { isoToLocalMs } from '@/lib/dates';
import type { SecondChanceRule } from '@/lib/content/types';
import { cancelBefore, remindBefore, remindedRuleIds } from '@/lib/second-chance-reminders';
import { secondChancesFor } from '@/lib/timelines';
import type { NoticeFacts, SecondChance } from '@/lib/timelines';
import { color, radius, space, type } from '@/lib/theme/tokens';

type Status = 'too_late' | 'no_permission';

function longDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "2026-09-24" as the person reads a date, in their language. */
function checkedDate(iso: string, locale: string): string {
  const ms = isoToLocalMs(iso);
  return ms === undefined ? iso : new Date(ms).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function SecondChances({ noticeId, facts, nowMs }: { noticeId: string; facts: NoticeFacts; nowMs: number }) {
  const { t, i18n } = useTranslation();
  const spanish = i18n.language.startsWith('es');
  const locale = i18n.language;

  const [reminded, setReminded] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string>();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [source, setSource] = useState<SecondChanceRule>();

  const chances: readonly SecondChance[] = useMemo(() => {
    try {
      return secondChancesFor(facts, loadTimelines().secondChances, nowMs);
    } catch {
      // A content pack that fails to parse costs this section, never the screen.
      return [];
    }
  }, [facts, nowMs]);

  useEffect(() => {
    void remindedRuleIds(noticeId)
      .then(setReminded)
      .catch(() => setReminded(new Set()));
  }, [noticeId]);

  const toggle = useCallback(
    async (chance: SecondChance) => {
      const ruleId = chance.rule.id;
      setBusy(ruleId);
      try {
        if (reminded.has(ruleId)) {
          await cancelBefore(noticeId, ruleId);
        } else {
          const result = await remindBefore(noticeId, chance);
          if (result !== 'scheduled') setStatus((s) => ({ ...s, [ruleId]: result }));
        }
        setReminded(await remindedRuleIds(noticeId));
      } finally {
        setBusy(undefined);
      }
    },
    [noticeId, reminded],
  );

  if (chances.length === 0) return null;

  return (
    <>
      <Divider />
      <Section title={t('secondChance.sectionTitle')}>
        <Muted>{t('secondChance.intro')}</Muted>
        {chances.map((chance) => {
          const rule = chance.rule;
          const isReminded = reminded.has(rule.id);
          const note = status[rule.id];
          return (
            <View key={rule.id} style={[styles.card, chance.passed && styles.cardPassed]}>
              <Text style={styles.date}>{t('secondChance.by', { date: longDate(chance.dateMs, locale) })}</Text>
              <Text style={styles.title}>{spanish ? rule.titleEs : rule.title}</Text>
              <Body>{spanish ? rule.es : rule.en}</Body>
              <Muted>{spanish ? rule.conditionEs : rule.condition}</Muted>
              {chance.passed ? (
                <Muted>{t('secondChance.passed')}</Muted>
              ) : (
                <>
                  {isReminded ? <Body>{t('secondChance.reminded')}</Body> : null}
                  <Button
                    title={isReminded ? t('secondChance.cancel') : t('secondChance.remindMe')}
                    variant={isReminded ? 'quiet' : 'secondary'}
                    busy={busy === rule.id}
                    onPress={() => void toggle(chance)}
                  />
                  {note === 'too_late' ? <Caption>{t('secondChance.tooLate')}</Caption> : null}
                  {note === 'no_permission' ? <Caption>{t('secondChance.noPermission')}</Caption> : null}
                </>
              )}
              <Button title={t('secondChance.whereFrom')} variant="quiet" onPress={() => setSource(rule)} />
            </View>
          );
        })}
      </Section>

      <Sheet visible={source !== undefined} onClose={() => setSource(undefined)} closeLabel={t('common.close')}>
        {source ? (
          <>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {spanish ? source.titleEs : source.title}
            </Text>
            <Text style={styles.label}>{t('secondChance.ruleTitle')}</Text>
            <View style={styles.quote}>
              <Body>{source.ruleText}</Body>
            </View>
            <Body>{source.sourceName}</Body>
            <Caption>{t('secondChance.checkedOn', { date: checkedDate(source.verifiedOn, i18n.language), kind: source.sourceKind })}</Caption>
            <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  cardPassed: { backgroundColor: color.neutralSoft },
  date: { ...type.heading, color: color.text },
  title: { ...type.subheading, color: color.text },
  sheetTitle: { ...type.title, color: color.text },
  label: { ...type.label, color: color.textMuted },
  quote: {
    padding: space.md,
    borderLeftWidth: 4,
    borderLeftColor: color.borderStrong,
    backgroundColor: color.neutralSoft,
    borderRadius: radius.sm,
  },
});
