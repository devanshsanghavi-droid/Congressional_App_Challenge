/**
 * Home — the countdown is the screen.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * SPEC §7: the dominant visual element, by a wide margin, is the days remaining
 * on the nearest deadline — not the programme name, not the notice text. This
 * screen opens the video, so the hierarchy is the design: one enormous number
 * in a colour, then what it is about, then everything else.
 *
 * The list is ordered by nearest deadline (the SQL does it), so the top card is
 * always the one that matters and the first thing on screen is the thing the
 * user came to find out.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, ErrorState, Screen } from '@/components/ui';
import { Countdown } from '@/components/Countdown';
import type { Notice } from '@/lib/db/notices';
import { listActiveNotices } from '@/lib/db/notices';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';
import { countdownDate } from '@/lib/urgency';
import { resyncDroppedReminders } from '@/lib/reschedule';
import type { NoticeDates } from '@/lib/urgency';

/** The dates a notice counts down on, in the shape `urgency.ts` expects. */
function datesOf(notice: Notice): NoticeDates {
  return {
    actionType: notice.actionType,
    ...(notice.deadlineDate === undefined ? {} : { deadlineDate: notice.deadlineDate }),
    ...(notice.aidPaidPendingDeadline === undefined
      ? {}
      : { aidPaidPendingDeadline: notice.aidPaidPendingDeadline }),
  };
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>();
  const [failed, setFailed] = useState(false);
  // Read once per load rather than during render: reading the clock in render
  // is impure, and two cards could otherwise be computed against different
  // milliseconds.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setNow(Date.now());
    setFailed(false);
    void (async () => {
      // Before listing: if permission was granted since these notices were
      // saved, put back the reminders that were dropped when it was refused.
      // No-ops when nothing is stranded, and never prompts.
      try {
        await resyncDroppedReminders();
      } catch {
        // A resync failure must never stop the list from rendering. The warning
        // card stays up, which is the honest state if the resync did not run.
      }
      try {
        setNotices(await listActiveNotices());
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  // On focus, not on mount: Review replaces this screen after a save, and a
  // stale list would make a successful save look like it failed.
  useFocusEffect(useCallback(() => void load(), [load]));

  // And on app foreground, which focus does NOT cover. The card's own button
  // sends the user to iOS Settings to grant permission; coming back from there
  // backgrounds and re-activates the app without this screen ever losing focus,
  // so `useFocusEffect` alone would leave the warning up until the user
  // navigated somewhere and back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => subscription.remove();
  }, [load]);

  const capture = (
    <Button
      title={t('home.action')}
      onPress={() => router.push('/capture')}
      accessibilityHint={t('home.actionHint')}
    />
  );

  if (failed) {
    return (
      <Screen footer={capture}>
        <ErrorState
          title={t('home.errorTitle')}
          body={t('home.errorBody')}
          action={<Button title={t('common.tryAgain')} onPress={load} variant="secondary" />}
        />
      </Screen>
    );
  }

  // `undefined` is "not loaded yet" and `[]` is "genuinely empty". Rendering
  // the empty state during the first read would flash "no notices yet" at
  // someone who has several.
  if (notices === undefined) return <Screen>{null}</Screen>;

  if (notices.length === 0) {
    return (
      <Screen footer={capture}>
        <EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        {/* Reachable before the first notice too: "where do I go" is a question
            someone has on day one, often before they have a letter to scan. */}
        <View style={styles.moreRow}>
          <Button
            title={t('where.title')}
            variant="secondary"
            onPress={() => router.push('/where')}
          />
          <Button
            title={t('settings.title')}
            variant="secondary"
            onPress={() => router.push('/settings')}
          />
        </View>
        <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
      </Screen>
    );
  }

  return (
    <Screen footer={capture}>
      {notices.map((notice) => {
        const dates = datesOf(notice);
        const hasDeadline = countdownDate(dates) !== undefined;
        const program = notice.programId ?? t('common.unknownProgram');
        const action = t(`review.actions.${notice.actionType}`, { defaultValue: notice.actionType });

        return (
          <Card
            key={notice.id}
            onPress={() => router.push(`/notice/${notice.id}`)}
            accessibilityLabel={`${program}. ${action}.`}
          >
            <Countdown dates={dates} nowMs={now} />

            <View style={styles.meta}>
              <Text style={styles.program}>{program}</Text>
              <Text style={styles.action}>{action}</Text>
              {notice.caseLast4 ? (
                <Text style={styles.case}>{t('notice.caseEnding', { last4: notice.caseLast4 })}</Text>
              ) : null}
            </View>

            {/* A deadline the app is silently not going to remind anyone about
                is the most dangerous state this product can be in, so it lives
                on the card for as long as it is true — and offers the fix. */}
            {!notice.remindersActive && hasDeadline ? (
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>{t('home.noRemindersTitle')}</Text>
                <Body>{t('home.noRemindersBody')}</Body>
                <Button
                  title={t('home.noRemindersAction')}
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      {/* Below-the-line screens (CLAUDE.md §10, priorities 7 and 8), placed
          last and styled quietly on purpose. Home is the countdown; these are
          two text links under it, and cutting either is deleting one line. */}
      {/* Buttons, not text links. These were three accent-coloured words in a
          row with a correct 44pt target and the visual weight of a footnote —
          the person this was built for tapped Expo's dev-tools gear twice
          looking for Settings, because Settings did not look like anything you
          could press. The disclaimer now sits BELOW them: it is legally
          required, but it was separating navigation from content and that is
          part of why the row read as fine print. */}
      <View style={styles.moreRow}>
        <Button title={t('vault.title')} variant="secondary" onPress={() => router.push('/vault')} />
        <Button title={t('where.title')} variant="secondary" onPress={() => router.push('/where')} />
        <Button
          title={t('settings.title')}
          variant="secondary"
          onPress={() => router.push('/settings')}
        />
      </View>
      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  moreRow: { gap: space.sm, paddingTop: space.sm },
  moreLink: { minHeight: touchTarget, justifyContent: 'center' },
  moreText: { ...type.bodyStrong, color: color.accent },

  meta: { gap: 2 },
  program: { ...type.heading, color: color.text },
  action: { ...type.body, color: color.textMuted },
  case: { ...type.caption, color: color.textFaint, marginTop: space.xs },

  warning: {
    marginTop: space.sm,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.redSoft,
    borderWidth: 1,
    borderColor: color.red,
  },
  warningTitle: { ...type.subheading, color: color.red },
});
