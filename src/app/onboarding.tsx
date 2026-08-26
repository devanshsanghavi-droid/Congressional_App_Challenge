/**
 * Onboarding — three screens, and a skip button on every one of them.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS FOR, AND WHAT IT IS NOT FOR
 * ---------------------------------------------------------------------------
 * Three things, in this order, because that is the order they matter in to the
 * person holding the phone:
 *
 *   1. **What Carta does.** Not features — the one promise: photograph the
 *      letter, Carta remembers the date and tells you before it passes.
 *   2. **Nothing leaves this phone.** Said early and said plainly, because for
 *      a mixed-status household this is not a nice-to-have, it is the question
 *      that decides whether the app gets used at all (CLAUDE.md §4, and the
 *      public-charge note on Notice Detail exists for the same reason).
 *   3. **The model download offer.** Optional, ~1 GB, wifi. Offered here so it
 *      can happen on wifi at home rather than being discovered later on cellular
 *      data — but never required, because the whole app works without it.
 *
 * ---------------------------------------------------------------------------
 * SKIPPABLE, AND WHY THAT IS LOAD-BEARING
 * ---------------------------------------------------------------------------
 * Every screen has Skip, at the top, always reachable. Not "skip on the last
 * one", not a small grey word in a corner.
 *
 * Someone opening this app is often opening it *because a letter arrived and
 * they are frightened*. Standing between that person and the camera to explain
 * a value proposition is the wrong trade every time. Skipping marks onboarding
 * done — it does not defer it — because a person who skipped has made a
 * decision and re-asking would be overriding it.
 *
 * **This screen never blocks.** The model download starts and the user moves on;
 * nothing here waits on a network call, and the download is the only network
 * call in the app (CLAUDE.md §3 rule 3).
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, ErrorState, Screen } from '@/components/ui';
import { SETTINGS, setBooleanSetting } from '@/lib/db/settings';
import { MODELS, downloadModel, formatBytes, modelFile } from '@/lib/llm/model';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

const MODEL = MODELS['qwen2.5-1.5b-instruct-q4_k_m'];

/** Three, fixed. A fourth would be a fourth reason not to reach the camera. */
const STEPS = ['what', 'private', 'model'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const step: Step = STEPS[index] ?? 'what';

  /**
   * The download, if the user accepts it here.
   *
   * `undefined` is "not started". This is the one network call in the app
   * (CLAUDE.md §3 rule 3) and it is entered only by tapping the button that
   * names its size.
   */
  const [progress, setProgress] = useState<number | null>();
  const [downloadFailed, setDownloadFailed] = useState<string>();
  const alreadyHave = modelFile(MODEL).exists;

  /**
   * Finish, whether by skipping or by reaching the end. Both write the same
   * flag: skipping is a decision, not a postponement.
   *
   * The write is awaited before navigating so the flag cannot lose a race with
   * the root layout's next read of it. If it fails the user still leaves —
   * being trapped in onboarding by a database error is worse than seeing it
   * twice.
   */
  const finish = useCallback(async () => {
    try {
      await setBooleanSetting(SETTINGS.onboardingDone, true);
    } catch {
      // Seeing onboarding again is a nuisance; being stuck in it is not.
    }
    router.replace('/');
  }, [router]);

  const next = useCallback(() => {
    setIndex((current) => current + 1);
  }, []);

  /**
   * Accept the download, then leave.
   *
   * **Deliberately not awaited.** A gigabyte on a phone connection is minutes,
   * and holding someone on an onboarding screen for it would be the opposite of
   * this screen's whole point. It runs in the background and Settings shows its
   * state; the user goes to Home now.
   */
  const startDownload = useCallback(() => {
    setDownloadFailed(undefined);
    setProgress(null);
    void downloadModel(MODEL, (p) => setProgress(p.fraction)).catch((error: unknown) => {
      setProgress(undefined);
      setDownloadFailed(error instanceof Error ? error.message : String(error));
    });
    void finish();
  }, [finish]);

  const last = index === STEPS.length - 1;

  return (
    <Screen
      insetTop
      footer={
        last ? (
          <>
            {/* A real offer: this button starts the download it just described.
                Pointing at Settings instead would be pointing at a screen that
                does not exist yet, which is placeholder copy by another name. */}
            <Button
              title={alreadyHave ? t('onboarding.alreadyHave') : t('onboarding.download')}
              onPress={alreadyHave ? () => void finish() : startDownload}
              disabled={progress !== undefined}
              accessibilityHint={
                alreadyHave ? t('onboarding.startHint') : t('onboarding.downloadHint')
              }
            />
            <Button
              title={t('onboarding.notNow')}
              variant="secondary"
              onPress={() => void finish()}
            />
          </>
        ) : (
          <Button title={t('onboarding.next')} onPress={next} />
        )
      }
    >
      <View style={styles.top}>
        {/* Always present, always in the same place, on every step. */}
        <Pressable
          onPress={() => void finish()}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
          accessibilityHint={t('onboarding.skipHint')}
          style={styles.skip}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
        </Pressable>

        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}
          accessibilityLabel={t('onboarding.stepOf', { step: index + 1, total: STEPS.length })}
        >
          {STEPS.map((name, i) => (
            <View key={name} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {t(`onboarding.${step}Title`)}
      </Text>
      <Body>{t(`onboarding.${step}Body`)}</Body>

      {step === 'private' ? (
        <View style={styles.points}>
          {/* Three concrete facts rather than the word "private". "Private" is
              what every app says; these are checkable, and one of them is the
              name of a test file. */}
          <Point text={t('onboarding.privatePoint1')} />
          <Point text={t('onboarding.privatePoint2')} />
          <Point text={t('onboarding.privatePoint3')} />
        </View>
      ) : null}

      {step === 'model' ? (
        <View style={styles.points}>
          <Point text={t('onboarding.modelPoint1')} />
          <Point text={t('onboarding.modelPoint2')} />
          <Point text={t('onboarding.modelPoint3')} />
          {/* Said here rather than only in Settings: the honest framing is that
              this is optional, and burying that would make the offer pushy. */}
          <Caption>{t('onboarding.modelLater')}</Caption>
          <Caption>{t('onboarding.modelSize', { size: formatBytes(MODEL.approxBytes) })}</Caption>
        </View>
      ) : null}

      {downloadFailed !== undefined ? (
        <ErrorState title={t('onboarding.downloadFailedTitle')} body={t('onboarding.downloadFailedBody')} />
      ) : null}

      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <Text style={styles.pointMark}>•</Text>
      <Body style={styles.pointText}>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  skip: { minHeight: touchTarget, justifyContent: 'center', paddingRight: space.md },
  skipText: { ...type.bodyStrong, color: color.accent },

  dots: { flexDirection: 'row', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.border },
  dotActive: { backgroundColor: color.accent },

  title: { ...type.title, color: color.text, marginBottom: space.sm },

  points: {
    gap: space.md,
    padding: space.lg,
    marginTop: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  point: { flexDirection: 'row', gap: space.sm },
  pointMark: { ...type.body, color: color.textMuted },
  pointText: { flex: 1 },
});
