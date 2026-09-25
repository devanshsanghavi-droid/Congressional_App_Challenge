/**
 * "Letters on the way": the next letter a confirmed notice implies, and the
 * question Carta asks when it has not come.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Sits on Home, under the countdowns and never above them (CLAUDE.md §2). A
 * forecast is not a deadline, so until it is time to ask it is one quiet line.
 * When the month has passed with nothing scanned, it becomes a card with the
 * question, because a letter lost in the mail is the one deadline nobody can
 * track: the county thinks it was delivered, and the family never knew it was
 * coming.
 *
 * "It never came" does not end in a shrug. It shows the county's numbers from
 * `content/offices.json`, the same sourced records Where to Go uses.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Muted, Section, Sheet } from '@/components/ui';
import { loadOffices } from '@/lib/content';
import { isoToLocalMs } from '@/lib/dates';
import type { ExpectedLetterRule, PhoneNumber } from '@/lib/content/types';
import { listWaiting } from '@/lib/db/expected';
import type { ExpectedLetter } from '@/lib/db/expected';
import { answerExpected, isDue, letterTitle, ruleFor } from '@/lib/expected-letters';
import type { LetterAnswer } from '@/lib/expected-letters';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

/** "2026-09-24" as the person reads a date, in their language. */
function checkedDate(iso: string, locale: string): string {
  const ms = isoToLocalMs(iso);
  return ms === undefined ? iso : new Date(ms).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function LettersOnTheWay({ nowMs }: { nowMs: number }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [waiting, setWaiting] = useState<ExpectedLetter[]>([]);
  const [busy, setBusy] = useState<string>();
  const [source, setSource] = useState<ExpectedLetterRule>();

  const load = useCallback(() => {
    void listWaiting()
      .then(setWaiting)
      .catch(() => setWaiting([]));
  }, []);

  // `nowMs` changes on every Home focus, which is when this should re-read.
  useEffect(load, [load, nowMs]);

  const answer = useCallback(
    async (id: string, value: LetterAnswer) => {
      setBusy(id);
      try {
        await answerExpected(id, value);
      } finally {
        setBusy(undefined);
        load();
      }
    },
    [load],
  );

  let phones: readonly PhoneNumber[] = [];
  let phoneTip: string | undefined;
  try {
    const offices = loadOffices();
    phones = offices.countyPhones;
    phoneTip = offices.phoneTip;
  } catch {
    phones = [];
  }

  const rows = waiting
    .map((expected) => ({ expected, rule: ruleFor(expected) }))
    .filter((row): row is { expected: ExpectedLetter; rule: ExpectedLetterRule } => row.rule !== undefined);
  if (rows.length === 0) return null;

  const monthOf = (ms: number): string => new Date(ms).toLocaleDateString(i18n.language, { month: 'long' });

  return (
    <>
      <Section title={t('expected.sectionTitle')}>
        {rows.map(({ expected, rule }) => {
          const title = letterTitle(rule);
          const month = monthOf(expected.expectFrom);
          const working = busy === expected.id;

          if (expected.state === 'not_arrived') {
            return (
              <Card key={expected.id}>
                <Text style={styles.heading}>{t('expected.neverCameTitle')}</Text>
                <Muted>{title}</Muted>
                <Body>{t('expected.neverCameBody')}</Body>
                {phones.map((phone) => (
                  <View key={`${phone.label}-${phone.number}`} style={styles.phone}>
                    <Text style={styles.phoneLabel}>{phone.label}</Text>
                    <Pressable
                      onPress={() => void Linking.openURL(`tel:${phone.number}`)}
                      accessibilityRole="link"
                      accessibilityLabel={t('where.callNumber', { number: phone.number })}
                      style={styles.link}
                    >
                      <Text style={styles.linkText}>{phone.number}</Text>
                    </Pressable>
                  </View>
                ))}
                {phoneTip ? <Muted>{phoneTip}</Muted> : null}
                <Button
                  title={t('expected.cameAfterAll')}
                  variant="secondary"
                  busy={working}
                  onPress={() => void answer(expected.id, 'came')}
                />
              </Card>
            );
          }

          if (isDue(expected, nowMs)) {
            return (
              <Card key={expected.id}>
                <Text style={styles.heading}>{t('expected.askTitle')}</Text>
                <Text style={styles.title}>{title}</Text>
                <Body>{t('expected.askBody', { month })}</Body>
                <Button title={t('expected.scanIt')} onPress={() => router.push('/capture')} />
                <Button
                  title={t('expected.notYet')}
                  variant="secondary"
                  busy={working}
                  onPress={() => void answer(expected.id, 'not_yet')}
                />
                <Button
                  title={t('expected.neverCame')}
                  variant="secondary"
                  onPress={() => void answer(expected.id, 'never_came')}
                />
                <Button title={t('expected.came')} variant="quiet" onPress={() => void answer(expected.id, 'came')} />
                <Button title={t('expected.online')} variant="quiet" onPress={() => void answer(expected.id, 'online')} />
                <Button title={t('expected.whereFrom')} variant="quiet" onPress={() => setSource(rule)} />
              </Card>
            );
          }

          return (
            <Pressable
              key={expected.id}
              onPress={() => setSource(rule)}
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${t('expected.usually', { month })}`}
              accessibilityHint={t('expected.whereFrom')}
              style={({ pressed }) => [styles.quiet, pressed && styles.quietPressed]}
            >
              <Text style={styles.title}>{title}</Text>
              <Muted>{t('expected.usually', { month })}</Muted>
            </Pressable>
          );
        })}
      </Section>

      <Sheet visible={source !== undefined} onClose={() => setSource(undefined)} closeLabel={t('common.close')}>
        {source ? (
          <>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {letterTitle(source)}
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
  heading: { ...type.heading, color: color.text },
  title: { ...type.subheading, color: color.text },
  quiet: {
    minHeight: touchTarget,
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  quietPressed: { backgroundColor: color.neutralSoft },
  phone: { gap: space.xs, paddingVertical: space.xs },
  phoneLabel: { ...type.body, color: color.textMuted },
  link: { minHeight: touchTarget, justifyContent: 'center' },
  linkText: { ...type.bodyStrong, color: color.accent },
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
