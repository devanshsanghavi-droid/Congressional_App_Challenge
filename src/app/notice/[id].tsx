/**
 * Notice Detail — four fixed sections, deadline first.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * SPEC §7: opens with the deadline and the action, not with prose. Order is the
 * countdown and what must be done, then the explanation, then how to appeal.
 * The four section headings are fixed and always in the same order, because a
 * letter is frightening partly because you do not know where to look — the same
 * four questions in the same four places is most of the value.
 *
 *   What this says · What you must do · By when · How to appeal
 *
 * Two things here are load-bearing beyond layout:
 *
 * **The original is always one tap away** (CLAUDE.md §4, guardrail 1). Both the
 * photograph and the recognised text, on this screen, never behind navigation.
 * The countdown is only worth anything if the user believes Carta read the
 * letter correctly, and this is how they check.
 *
 * **The appeal routing is real data**, from `content/offices.json` — the county
 * Appeals Unit address and the state hearings number, sourced and dated. It
 * renders its `verified_on` because CLAUDE.md §16 requires content to carry its
 * provenance, and because an address that is quietly two years stale is worse
 * than no address.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Divider, ErrorState, Muted, Screen, Section, Sheet } from '@/components/ui';
import { Countdown } from '@/components/Countdown';
import { Explanation } from '@/components/Explanation';
import { WorthChecking } from '@/components/WorthChecking';
import { loadOffices } from '@/lib/content';
import { listRequirements, progressOf } from '@/lib/db/checklist';
import type { ChecklistProgress } from '@/lib/db/checklist';
import type { AppealsInfo } from '@/lib/content/types';
import { decryptCaptureForDisplay, discardDecryptedPreviews } from '@/lib/db/images';
import { getNotice, getNoticeRecipientName, getNoticeText } from '@/lib/db/notices';
import type { Notice } from '@/lib/db/notices';
import { color, radius, space, type } from '@/lib/theme/tokens';
import type { NoticeDates } from '@/lib/urgency';

type Viewing = 'none' | 'photo' | 'text';

function datesOf(notice: Notice): NoticeDates {
  return {
    actionType: notice.actionType,
    ...(notice.deadlineDate === undefined ? {} : { deadlineDate: notice.deadlineDate }),
    ...(notice.aidPaidPendingDeadline === undefined
      ? {}
      : { aidPaidPendingDeadline: notice.aidPaidPendingDeadline }),
  };
}

/** A date the user can read, in their language, from epoch millis. */
function longDate(ms: number, locale: string): string {
  return new Date(ms).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function NoticeDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [notice, setNotice] = useState<Notice>();
  const [recipient, setRecipient] = useState<string>();
  const [originalText, setOriginalText] = useState<string>();
  const [appeals, setAppeals] = useState<AppealsInfo>();
  const [photoUri, setPhotoUri] = useState<string>();
  const [viewing, setViewing] = useState<Viewing>('none');
  const [checklist, setChecklist] = useState<ChecklistProgress>();
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const found = await getNotice(id);
        if (cancelled) return;
        if (!found) {
          setFailed(true);
          return;
        }
        setNotice(found);
        setAppeals(loadOffices().appeals);
        // Both come out of the encrypted envelope. One decrypt, on a screen
        // that shows a single record — never from Home.
        setRecipient(await getNoticeRecipientName(id));
        setOriginalText(await getNoticeText(id));
        // Read after the notice, never before: a checklist that fails to load
        // must not stop the deadline rendering, which is what this screen is
        // actually for.
        if (!cancelled) setChecklist(progressOf(await listRequirements(id)));
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    // Decrypted previews live in the cache directory; drop them when this
    // screen goes away so a plaintext copy does not outlive the look.
    return () => {
      cancelled = true;
      discardDecryptedPreviews();
    };
  }, [id]);

  const showPhoto = useCallback(async () => {
    setPhotoUri(await decryptCaptureForDisplay(id));
    setViewing('photo');
  }, [id]);

  if (failed) {
    return (
      <Screen>
        <ErrorState
          title={t('detail.errorTitle')}
          body={t('detail.errorBody')}
          action={<Button title={t('common.back')} variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }
  if (!notice) return <Screen>{null}</Screen>;

  const dates = datesOf(notice);
  const program = notice.programId ?? t('common.unknownProgram');
  const action = t(`review.actions.${notice.actionType}`, { defaultValue: notice.actionType });
  const locale = i18n.language;

  return (
    <Screen>
      {/* Deadline and action first. Prose comes after. */}
      <Card>
        <Countdown dates={dates} nowMs={now} />
        <Text style={styles.program}>{program}</Text>
        <Text style={styles.action}>{action}</Text>
      </Card>

      <Section title={t('detail.whatThisSays')}>
        <Body>
          {t('detail.saysFrom', { program, office: notice.agency ?? t('detail.yourOffice') })}
          {' '}
          {/* One written sentence per action type. Interpolating the action
              label into a template produced "your benefits are time to renew",
              which is not a sentence anyone would write. */}
          {t(`detail.says_${notice.actionType}`, { defaultValue: '' })}
        </Body>
        {recipient ? <Muted>{t('detail.addressedTo', { name: recipient })}</Muted> : null}
        {notice.noticeDate !== undefined ? (
          <Muted>{t('detail.letterDated', { date: longDate(notice.noticeDate, locale) })}</Muted>
        ) : null}
      </Section>

      <Divider />

      <Section title={t('detail.whatYouMustDo')}>
        {notice.deadlineDate !== undefined ? (
          <Body>{t('detail.mustDoWithDeadline')}</Body>
        ) : notice.actionType === 'approval' ? (
          <Body>{t('detail.mustDoApproval')}</Body>
        ) : (
          <Body>{t('detail.mustDoNoDeadline')}</Body>
        )}
      </Section>

      <Divider />

      <Section title={t('detail.byWhen')}>
        {notice.deadlineDate !== undefined ? (
          <Body>{t('detail.deadlineIs', { date: longDate(notice.deadlineDate, locale) })}</Body>
        ) : (
          <Muted>{t('detail.noDeadlineFound')}</Muted>
        )}
        {notice.aidPaidPendingDeadline !== undefined ? (
          <View style={styles.urgent}>
            <Text style={styles.urgentTitle}>{t('detail.keepBenefitsTitle')}</Text>
            <Body>
              {t('detail.keepBenefitsBody', {
                date: longDate(notice.aidPaidPendingDeadline, locale),
              })}
            </Body>
          </View>
        ) : null}
        {notice.effectiveDate !== undefined ? (
          <Muted>{t('detail.takesEffect', { date: longDate(notice.effectiveDate, locale) })}</Muted>
        ) : null}
      </Section>

      <Divider />

      {/* Between "by when" and the model's rewrite, because "what do I have to
          send" is the second question after "when" — and it is the one that
          decides whether the deadline is actually met. A summary and a way in,
          never the list itself: the countdown stays the screen (CLAUDE.md §2). */}
      <Section title={t('checklist.openChecklist')}>
        {checklist === undefined ? null : checklist.total === 0 ? (
          <Muted>{t('checklist.summaryNone')}</Muted>
        ) : checklist.ready ? (
          <Body>{t('checklist.summaryReady')}</Body>
        ) : (
          <Body>
            {t('checklist.summaryProgress', {
              done: checklist.resolved,
              total: checklist.total,
            })}
          </Body>
        )}
        <Button
          title={t('checklist.openChecklist')}
          variant="secondary"
          accessibilityHint={t('checklist.openChecklistHint')}
          onPress={() => router.push(`/checklist/${id}`)}
        />
      </Section>

      <Divider />

      {/* On demand, behind a tap. The four sections above are the app's own and
          do not wait on inference; this offers the model's rewrite underneath
          them. Guardrails live inside the component. */}
      <Section title={t('detail.inPlainWords')}>
        {originalText ? (
          <Explanation
            program={program}
            office={notice.agency ?? t('detail.yourOffice')}
            actionType={notice.actionType}
            noticeText={originalText}
            {...(notice.deadlineDate === undefined
              ? {}
              : { deadline: longDate(notice.deadlineDate, locale) })}
            {...(notice.aidPaidPendingDeadline === undefined
              ? {}
              : { hearingBy: longDate(notice.aidPaidPendingDeadline, locale) })}
            /* Every date on this notice, not just the two above. The user
               confirmed all of them on Review, and the sanity pass withholds
               any date it cannot find here — so a short list makes it reject
               correct explanations that mention the coverage end date. */
            confirmedDates={[
              notice.deadlineDate,
              notice.aidPaidPendingDeadline,
              notice.appealDeadline,
              notice.noticeDate,
              notice.effectiveDate,
            ]
              .filter((ms): ms is number => ms !== undefined)
              .map((ms) => longDate(ms, locale))}
          />
        ) : (
          // Without the stored text there is nothing to rewrite, and saying so
          // is better than a button that cannot work.
          <Muted>{t('detail.noTextToExplain')}</Muted>
        )}
      </Section>

      <Divider />

      <Section title={t('detail.howToAppeal')}>
        {appeals ? (
          <>
            <Body>{appeals.how}</Body>
            {notice.appealDeadline !== undefined ? (
              <Body>{t('detail.appealBy', { date: longDate(notice.appealDeadline, locale) })}</Body>
            ) : null}

            <View style={styles.contact}>
              <Text style={styles.contactLabel}>{t('detail.stateHearings')}</Text>
              <Pressable
                onPress={() => void Linking.openURL(`tel:${appeals.stateHearingsPhone}`)}
                accessibilityRole="link"
                accessibilityLabel={t('detail.callNumber', { number: appeals.stateHearingsPhone })}
                style={styles.link}
              >
                <Text style={styles.linkText}>{appeals.stateHearingsPhone}</Text>
              </Pressable>
              <Text style={styles.contactLabel}>{t('detail.tdd')}</Text>
              <Pressable
                onPress={() => void Linking.openURL(`tel:${appeals.stateHearingsTdd}`)}
                accessibilityRole="link"
                accessibilityLabel={t('detail.callNumber', { number: appeals.stateHearingsTdd })}
                style={styles.link}
              >
                <Text style={styles.linkText}>{appeals.stateHearingsTdd}</Text>
              </Pressable>
            </View>

            <View style={styles.contact}>
              <Text style={styles.contactLabel}>{t('detail.orWriteTo')}</Text>
              <Text style={styles.address}>{appeals.appealsUnit.name}</Text>
              <Text style={styles.address}>{appeals.appealsUnit.address}</Text>
              <Text style={styles.address}>
                {appeals.appealsUnit.city}, {appeals.appealsUnit.state} {appeals.appealsUnit.zip}
              </Text>
            </View>

            <Muted>{appeals.ombudsNote}</Muted>
            {/* CLAUDE.md §16: content carries its provenance. */}
            <Caption>{t('detail.verifiedOn', { date: appeals.verifiedOn })}</Caption>
          </>
        ) : (
          <Muted>{t('detail.appealsUnavailable')}</Muted>
        )}
      </Section>

      <Divider />

      {/* Guardrail 1: the original is one tap away, on this screen. */}
      <Section title={t('detail.checkForYourself')}>
        <Muted>{t('detail.checkBody')}</Muted>
        {notice.imageRef ? (
          <Button title={t('detail.seePhoto')} variant="secondary" onPress={() => void showPhoto()} />
        ) : (
          <Caption>{t('detail.photoDeleted')}</Caption>
        )}
        {originalText ? (
          <Button title={t('detail.seeText')} variant="secondary" onPress={() => setViewing('text')} />
        ) : (
          <Caption>{t('detail.textNotStored')}</Caption>
        )}
      </Section>

      {/* Last, deliberately. SPEC §2.1 puts the cross-reference on this screen
          rather than on one of its own, and CLAUDE.md §2 says nothing may take
          priority from the countdown — so it sits below the trust affordance,
          where someone who has already dealt with the deadline will find it.
          It renders nothing at all when the programme has no entries. */}
      <WorthChecking program={notice.programId} />

      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>

      <Sheet
        visible={viewing !== 'none'}
        onClose={() => setViewing('none')}
        closeLabel={t('common.close')}
      >
        {viewing === 'photo' && photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} accessibilityLabel={t('detail.photoAlt')} />
        ) : null}
        {viewing === 'text' && originalText ? (
          <>
            <Caption>{t('detail.textIsAsRead')}</Caption>
            <Text style={styles.originalText}>{originalText}</Text>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  program: { ...type.title, color: color.text },
  action: { ...type.body, color: color.textMuted },

  urgent: {
    marginTop: space.sm,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.amberSoft,
    borderWidth: 1,
    borderColor: color.amber,
  },
  urgentTitle: { ...type.subheading, color: color.amber },

  contact: { marginTop: space.sm, gap: 2 },
  contactLabel: { ...type.label, color: color.textMuted, marginTop: space.xs },
  address: { ...type.body, color: color.text },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...type.bodyStrong, color: color.accent },

  photo: { width: '100%', height: 520, resizeMode: 'contain', borderRadius: radius.md },
  originalText: { ...type.body, color: color.text, fontFamily: 'Courier', lineHeight: 22 },
});
