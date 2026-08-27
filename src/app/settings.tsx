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
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Body, Button, Caption, Card, Divider, Muted, Screen, Section } from '@/components/ui';
import {
  SETTINGS,
  getBooleanSetting,
  getStringSetting,
  setBooleanSetting,
  setStringSetting,
} from '@/lib/db/settings';
import { formatRememberedTraces, hasTraces } from '@/lib/diagnostics/last-trace';
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import type { SupportedLanguage } from '@/lib/i18n';
import { MODELS, deleteModel, downloadModel, formatBytes, modelFile } from '@/lib/llm/model';
import { rescheduleAllNotices } from '@/lib/reschedule';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  isReminderTime,
} from '@/lib/urgency';
import { wipeEverything } from '@/lib/wipe';
// TEMPORARY DIAGNOSTIC — 2026-08-26. Remove once the notification-state
// question is settled. Reads iOS back; changes nothing.
import * as Notifications from 'expo-notifications';

const MODEL = MODELS['qwen2.5-1.5b-instruct-q4_k_m'];

/**
 * The privacy statement lives in `settings.privacyExact` (en/es) and **nowhere
 * else**.
 *
 * It used to be duplicated here as a `PRIVACY_SENTENCE` constant as well, which
 * is precisely how it drifted: the sentence claimed the recipient's name was
 * stored in plaintext and the photograph was a plain file, and by 2026-08-26
 * neither was true — migration v2 drops the `recipient_name` column and the name
 * moved into the encrypted payload, and the photo is deleted by default and
 * encrypted under the notice key when kept.
 *
 * Both drifts *understated* the app, which is why nothing looked wrong. A claim
 * with two homes has no home. `tests/node/settings-strings.test.ts` pins the
 * rendered string against NOTES.md so the two cannot separate again.
 */

type Wipe = 'idle' | 'working' | 'partial';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [language, setLanguage] = useState<SupportedLanguage>(
    () => (i18n.language.split('-')[0] as SupportedLanguage) ?? 'en',
  );
  const [reminderAt, setReminderAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(DEFAULT_REMINDER_HOUR, DEFAULT_REMINDER_MINUTE, 0, 0);
    return d;
  });
  const [hasModel, setHasModel] = useState(() => modelFile(MODEL).exists);
  const [progress, setProgress] = useState<number>();
  const [modelError, setModelError] = useState<string>();
  const [wipe, setWipe] = useState<Wipe>('idle');
  const [wipeFailed, setWipeFailed] = useState<readonly string[]>([]);

  // TEMPORARY DIAGNOSTIC — the raw permission record, not the boolean derived
  // from it. The app says reminders cannot be set while iOS Settings shows
  // notifications ON, and the recorded suspicion is that `granted` is false for
  // provisional authorisation (iOS status 3) while expo maps only authorized
  // (2) to granted. Print the value rather than reason about it.
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [perm, setPerm] = useState<string>('reading…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const on = await getBooleanSetting(SETTINGS.showDiagnostics);
        if (!cancelled) setShowDiagnostics(on);
      } catch {
        // Off is the safe default and is already what state holds.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDiagnostics = useCallback((next: boolean) => {
    setShowDiagnostics(next);
    void setBooleanSetting(SETTINGS.showDiagnostics, next).catch(() => {
      // Applied for this session either way.
    });
  }, []);

  useEffect(() => {
    if (!showDiagnostics) return;
    void (async () => {
      try {
        const p = await Notifications.getPermissionsAsync();
        const ios = (p as { ios?: Record<string, unknown> }).ios;
        setPerm(
          [
            `granted        = ${String(p.granted)}`,
            `canAskAgain    = ${String(p.canAskAgain)}`,
            `status         = ${String(p.status)}`,
            `ios.status     = ${String(ios?.['status'])}`,
            `ios.allowsAlert= ${String(ios?.['allowsAlert'])}`,
            `ios.allowsSound= ${String(ios?.['allowsSound'])}`,
            '',
            'IosAuthorizationStatus:',
            `  NOT_DETERMINED=${Notifications.IosAuthorizationStatus.NOT_DETERMINED}`,
            `  DENIED        =${Notifications.IosAuthorizationStatus.DENIED}`,
            `  AUTHORIZED    =${Notifications.IosAuthorizationStatus.AUTHORIZED}`,
            `  PROVISIONAL   =${Notifications.IosAuthorizationStatus.PROVISIONAL}`,
            `  EPHEMERAL     =${String(Notifications.IosAuthorizationStatus.EPHEMERAL)}`,
          ].join('\n'),
        );
      } catch (error) {
        setPerm(`threw: ${String(error)}`);
      }
    })();
  }, [showDiagnostics]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const h = await getStringSetting(SETTINGS.reminderHour);
        const m = await getStringSetting(SETTINGS.reminderMinute);
        const hour = h === undefined ? NaN : Number.parseInt(h, 10);
        const minute = m === undefined ? 0 : Number.parseInt(m, 10);
        if (!cancelled && isReminderTime(hour, minute)) {
          const next = new Date();
          next.setHours(hour, minute, 0, 0);
          setReminderAt(next);
        }
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
  /**
   * Change the reminder time, then rebuild every scheduled reminder.
   *
   * The reschedule is the whole point. Reminders already registered with iOS
   * carry the fire time they were created with, so writing the setting alone
   * would change what this screen says and nothing about when the phone
   * actually buzzes.
   */
  const chooseTime = useCallback((next: Date) => {
    setReminderAt(next);
    const hour = next.getHours();
    const minute = next.getMinutes();
    void (async () => {
      try {
        await setStringSetting(SETTINGS.reminderHour, String(hour));
        await setStringSetting(SETTINGS.reminderMinute, String(minute));
        await rescheduleAllNotices(hour, minute);
      } catch {
        // Leave the old reminders in place rather than cancelling into nothing:
        // a reminder at the wrong time still fires, and none does not.
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
          {/* A real picker, not a list of presets. It also settles the time
              format question for free: the native control follows iOS Settings
              > General > Date & Time > 24-Hour Time and the device locale, so
              nothing here hardcodes either form. */}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('settings.reminderAt')}</Text>
            <DateTimePicker
              value={reminderAt}
              mode="time"
              display="compact"
              accessibilityLabel={t('settings.reminderAt')}
              onChange={(_event, date) => {
                if (date) chooseTime(date);
              }}
            />
          </View>
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

      <Section title={t('settings.diagnosticsTitle')}>
        <Card>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t('settings.diagnosticsToggle')}</Text>
            <Switch
              value={showDiagnostics}
              onValueChange={toggleDiagnostics}
              accessibilityLabel={t('settings.diagnosticsToggle')}
            />
          </View>
          <Muted>{t('settings.diagnosticsWhat')}</Muted>

          {showDiagnostics ? (
            <>
              <Divider />
              <Text style={styles.exactTitle}>notification permission</Text>
              <Text selectable style={styles.mono}>{perm}</Text>
              <Divider />
              <Text style={styles.exactTitle}>last captures</Text>
              <Text selectable style={styles.mono}>
                {hasTraces() ? formatRememberedTraces() : 'no captures recorded yet'}
              </Text>
            </>
          ) : null}
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
  mono: { fontFamily: 'Menlo', fontSize: 11, color: color.textMuted },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
    gap: space.md,
  },
  toggleLabel: { ...type.body, color: color.text, flexShrink: 1 },
});
