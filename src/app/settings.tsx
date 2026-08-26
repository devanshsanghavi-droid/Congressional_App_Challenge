/**
 * Settings.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS, AND WHY IT STOPPED BEING PRIORITY 6
 * ---------------------------------------------------------------------------
 * CLAUDE.md §10 lists Settings sixth, below Checklist and Vault. That ordering
 * was wrong, and a cold-start pass on 2026-08-25 showed why.
 *
 * Six user-facing strings told people to go to Settings. Two of them mean
 * *iOS* Settings and worked. The other four meant Carta's, which did not exist:
 *
 *   - onboarding's `modelLater`: "You can turn this on later in Settings."
 *   - Notice Detail's `notDownloaded`: "Turn it on in Settings."
 *   - `downloadFailedBody`: "You can try again later in Settings."
 *   - `photoDeleted`: "You can change that in Settings."
 *
 * The only production path to the model download was the onboarding screen, and
 * onboarding runs exactly once. So a user who tapped **"Not now"** — the safe,
 * obvious choice on a metered connection — was told they could enable it later
 * and then could not, ever. The plain-language explanation, one of the two
 * things this app is *for*, was permanently unreachable, and Notice Detail
 * rendered a sentence pointing at a screen that was not there.
 *
 * That is not a missing feature. It is a promise the app makes and breaks, and
 * the screen is the fix.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS HERE, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------
 * Five things, in the order someone needs them:
 *
 *   1. **Language.** First because a user who cannot read the screen cannot use
 *      anything below it.
 *   2. **The local model** — download, delete, size, and what it does in words
 *      that do not assume the reader knows what a model is. This is the item
 *      that made the screen urgent.
 *   3. **Reminder timing.** The product is a deadline tracker; the hour a
 *      reminder arrives is the difference between seen and missed.
 *   4. **Privacy**, stated in the sentence the project already committed to
 *      rather than a paraphrase — see `PRIVACY_SENTENCE`.
 *   5. **Delete everything**, last, behind a confirmation.
 *
 * Not here: the `deleteSourceImage` toggle. `photoDeleted` copy points at it, so
 * it is listed under Privacy as a stated behaviour — but it is a **default-on
 * privacy protection** (SPEC §5), and offering a one-tap "keep the most legible
 * copy of my case number on disk" beside a paragraph explaining that nothing
 * leaves the phone is a trap, not a setting. If it becomes one it needs its own
 * confirmation. Tracked in NOTES.md.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Divider, Muted, Screen, Section } from '@/components/ui';
import { SETTINGS, getStringSetting, setStringSetting } from '@/lib/db/settings';
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import type { SupportedLanguage } from '@/lib/i18n';
import { MODELS, deleteModel, downloadModel, formatBytes, modelFile } from '@/lib/llm/model';
import { rescheduleAllNotices } from '@/lib/reschedule';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';
import { DEFAULT_REMINDER_HOUR, REMINDER_HOURS, isReminderHour } from '@/lib/urgency';
import type { ReminderHour } from '@/lib/urgency';
import { wipeEverything } from '@/lib/wipe';

const MODEL = MODELS['qwen2.5-1.5b-instruct-q4_k_m'];

/**
 * The privacy statement, **verbatim from NOTES.md (2026-08-20)**.
 *
 * That entry established that "the database is encrypted" is *false*: the model
 * is field-level, so the OCR text is AES-256-GCM ciphertext and the case number
 * is a salted hash plus last 4 — but the recipient name, the dates, the
 * programme and the photo file are plaintext. It then wrote "the honest
 * one-sentence version", and this is that sentence, unedited.
 *
 * CLAUDE.md §11: *"Never say 'the database is encrypted' — say what is actually
 * true, which is still strong because none of it leaves the phone."* Settings is
 * exactly where someone goes to check that claim, so it is the last place a
 * comfortable paraphrase belongs.
 *
 * **A reading-level exception, made deliberately.** CLAUDE.md §10 requires all
 * copy at ≤6th grade and this sentence is nowhere near it. So it does not carry
 * the section: three plain sentences above it say what matters — it stays on the
 * phone, the photo is deleted, nothing is ever sent — and this sits underneath
 * them under its own heading, for the reader who wants the precise claim. Plain
 * copy first, exact copy available, neither one softened into the other.
 *
 * `tests/app/settings-strings.test.ts` pins it against NOTES.md so a later edit
 * cannot quietly round it up to "everything is encrypted".
 */
export const PRIVACY_SENTENCE =
  'The text of the letter is encrypted with AES-256-GCM under a key that never ' +
  'leaves the device; the case number is never stored, only a salted hash and ' +
  "the last four digits; the deadline dates, the programme, and the recipient's " +
  'name are stored in plaintext so the app can sort, display and correct them, ' +
  'and the photograph is a plain file inside the app sandbox.';

type Wipe = 'idle' | 'working' | 'partial';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [language, setLanguage] = useState<SupportedLanguage>(
    () => (i18n.language.split('-')[0] as SupportedLanguage) ?? 'en',
  );
  const [hour, setHour] = useState<ReminderHour>(DEFAULT_REMINDER_HOUR);
  const [hasModel, setHasModel] = useState(() => modelFile(MODEL).exists);
  const [progress, setProgress] = useState<number>();
  const [modelError, setModelError] = useState<string>();
  const [wipe, setWipe] = useState<Wipe>('idle');
  const [wipeFailed, setWipeFailed] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getStringSetting(SETTINGS.reminderHour);
        const parsed = stored === undefined ? NaN : Number.parseInt(stored, 10);
        if (!cancelled && isReminderHour(parsed)) setHour(parsed);
      } catch {
        // The default hour is a good hour. A read failure is not worth a banner.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Change language immediately, then persist.
   *
   * The UI switches first because the user is looking at it; the write is what
   * makes it survive a relaunch. If the write fails the session is still in the
   * chosen language, which is the part they asked for.
   */
  const chooseLanguage = useCallback((next: SupportedLanguage) => {
    setLanguage(next);
    void i18n.changeLanguage(next);
    void setStringSetting(SETTINGS.language, next).catch(() => {
      // Applied for this session; it will fall back to the phone's language.
    });
  }, []);

  /**
   * Change the reminder hour, then rebuild every scheduled reminder.
   *
   * The reschedule is the whole point. Reminders already registered with iOS
   * carry their old fire time, so writing the setting alone would change what
   * the screen says and nothing about when the phone actually buzzes — the
   * exact shape of the reminder bug found on 2026-08-25, where the database and
   * the OS disagreed and only the database was consulted.
   */
  const chooseHour = useCallback((next: ReminderHour) => {
    setHour(next);
    void (async () => {
      try {
        await setStringSetting(SETTINGS.reminderHour, String(next));
        await rescheduleAllNotices(next);
      } catch {
        // Leave the old reminders in place rather than cancelling into nothing:
        // a reminder at the wrong hour still fires, and none does not.
      }
    })();
  }, []);

  const startDownload = useCallback(() => {
    setModelError(undefined);
    setProgress(0);
    void downloadModel(MODEL, (p) => setProgress(p.fraction ?? 0))
      .then(() => {
        setProgress(undefined);
        setHasModel(modelFile(MODEL).exists);
      })
      .catch((error: unknown) => {
        setProgress(undefined);
        setModelError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const removeModel = useCallback(() => {
    try {
      deleteModel(MODEL);
    } catch {
      // Reflected below by re-reading the filesystem rather than assuming.
    }
    setHasModel(modelFile(MODEL).exists);
  }, []);

  /**
   * Delete everything, behind the system confirmation.
   *
   * `Alert` rather than a custom sheet on purpose: this is the one irreversible
   * action in the app, and the OS dialog is the interaction every iPhone user
   * already recognises as "this one is serious".
   */
  const confirmWipe = useCallback(() => {
    Alert.alert(t('settings.wipeConfirmTitle'), t('settings.wipeConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.wipeConfirmAction'),
        style: 'destructive',
        onPress: () => {
          setWipe('working');
          void (async () => {
            const result = await wipeEverything();
            if (result.complete) {
              // Back to a genuinely first-launch app.
              router.replace('/');
              return;
            }
            setWipeFailed(result.failed);
            setWipe('partial');
          })();
        },
      },
    ]);
  }, [router, t]);

  const downloading = progress !== undefined;

  return (
    <Screen>
      <Section title={t('settings.languageTitle')}>
        <Card>
          {SUPPORTED_LANGUAGES.map((code) => (
            <Choice
              key={code}
              label={t(`settings.language.${code}`)}
              selected={language === code}
              onPress={() => chooseLanguage(code)}
            />
          ))}
        </Card>
      </Section>

      <Section title={t('settings.modelTitle')}>
        <Card>
          <Body>{t('settings.modelWhat')}</Body>
          <Muted>{t('settings.modelSize', { size: formatBytes(MODEL.approxBytes) })}</Muted>

          {downloading ? (
            <>
              <Muted>{t('settings.modelDownloading', { percent: Math.round((progress ?? 0) * 100) })}</Muted>
              <View style={styles.track} accessibilityRole="progressbar">
                <View style={[styles.fill, { width: `${Math.round((progress ?? 0) * 100)}%` }]} />
              </View>
            </>
          ) : hasModel ? (
            <>
              <Body>{t('settings.modelReady')}</Body>
              <Button
                title={t('settings.modelDelete')}
                variant="secondary"
                onPress={removeModel}
                accessibilityHint={t('settings.modelDeleteHint')}
              />
            </>
          ) : (
            <>
              <Muted>{t('settings.modelAbsent')}</Muted>
              <Button
                title={t('settings.modelDownload', { size: formatBytes(MODEL.approxBytes) })}
                onPress={startDownload}
                accessibilityHint={t('settings.modelDownloadHint')}
              />
            </>
          )}

          {modelError === undefined ? null : (
            <View style={styles.problem}>
              <Text style={styles.problemTitle}>{t('settings.modelFailedTitle')}</Text>
              <Body>{t('settings.modelFailedBody')}</Body>
            </View>
          )}
        </Card>
      </Section>

      <Section title={t('settings.reminderTitle')}>
        <Card>
          <Muted>{t('settings.reminderWhat')}</Muted>
          {REMINDER_HOURS.map((option) => (
            <Choice
              key={option}
              label={t(`settings.hour.${option}`)}
              selected={hour === option}
              onPress={() => chooseHour(option)}
            />
          ))}
        </Card>
      </Section>

      <Section title={t('settings.privacyTitle')}>
        <Card>
          <Body>{t('settings.privacyStored')}</Body>
          <Body>{t('settings.privacyPhoto')}</Body>
          <Body>{t('settings.privacyNetwork')}</Body>
          <Divider />
          <Text style={styles.exactTitle}>{t('settings.privacyExactTitle')}</Text>
          <Muted>{t('settings.privacyExact')}</Muted>
        </Card>
      </Section>

      <Section title={t('settings.wipeTitle')}>
        <Card>
          <Body>{t('settings.wipeWhat')}</Body>
          <Button
            title={t('settings.wipeAction')}
            variant="secondary"
            onPress={confirmWipe}
            busy={wipe === 'working'}
            accessibilityHint={t('settings.wipeHint')}
          />
          {wipe === 'partial' ? (
            <View style={styles.problem}>
              <Text style={styles.problemTitle}>{t('settings.wipePartialTitle')}</Text>
              {/* Names what did not go. Saying "deleted" when four of five steps
                  ran would be the single most damaging lie this app could tell. */}
              <Body>{t('settings.wipePartialBody', { steps: wipeFailed.join(', ') })}</Body>
            </View>
          ) : null}
        </Card>
      </Section>

      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

/** A radio row. ≥44pt, labelled for a screen reader as a selectable option. */
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
      {/* A tick, not colour alone — the same rule the countdown follows. */}
      <Text style={styles.tick}>{selected ? '✓' : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  choicePressed: { opacity: 0.6 },
  choiceLabel: { ...type.body, color: color.text, flexShrink: 1 },
  choiceLabelOn: { ...type.bodyStrong, color: color.accent },
  tick: { ...type.bodyStrong, color: color.accent },

  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: color.accent },

  problem: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.redSoft,
    borderWidth: 1,
    borderColor: color.red,
  },
  problemTitle: { ...type.subheading, color: color.red },
  exactTitle: { ...type.label, color: color.text },
});
