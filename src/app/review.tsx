/**
 * Review — where mistakes get fixed, not merely confirmed.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * This screen exists because of a measurement. On 23 real photographs,
 * deterministic extraction holds **100% precision on every date it schedules
 * on**, and drops to 90.5% and 91.3% on the name and the case number — and
 * those failures are OCR character misreads, so they arrive looking completely
 * plausible. `01-8313-2205` is a well-formed case number. It is the wrong one.
 *
 * So the two populations are presented differently:
 *
 *   - dates arrive already checked, with the reading shown plainly. Asking the
 *     user to re-verify nine fields teaches them to tap through everything,
 *     which is how the one wrong field gets confirmed too.
 *   - the name and the case number are flagged **regardless of confidence**,
 *     because the failure mode is precisely a confident wrong answer, and the
 *     screen opens with the cursor in the worst of them.
 *
 * A single blended confidence score would average those two populations into a
 * number that describes neither, which is why `FIELD_RISK` is per field and set
 * from measurement.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ExtractedNotice, FieldKey } from '@/lib/extraction-port/port';
import { FIELD_ORDER, effectiveRisk, fieldNeedingAttention } from '@/lib/extraction-port/port';
import { saveNotice, setImageRef } from '@/lib/db/notices';
import { discardCapture, storeCaptureEncrypted } from '@/lib/db/images';
import { getBooleanSetting, SETTINGS } from '@/lib/db/settings';
import { isoToLocalMs } from '@/lib/dates';
import { recordScheduled } from '@/lib/db/reminders';
import { listScheduled, requestPermission, scheduleForNotice } from '@/lib/notifications';
import { useCaptureStore } from '@/lib/store/capture';
import { startTrace } from '@/lib/diagnostics/trace';
import { rememberTrace } from '@/lib/diagnostics/last-trace';
import type { ActionType } from '@/lib/urgency';
import { Body, Button, Caption, Muted, Screen } from '@/components/ui';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

const DATE_FIELDS: readonly FieldKey[] = [
  'deadlineDate',
  'noticeDate',
  'effectiveDate',
  'aidPaidPendingDeadline',
  'appealDeadline',
];

export default function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pending = useCaptureStore((s) => s.pending);
  const clear = useCaptureStore((s) => s.clear);

  const [fields, setFields] = useState<ExtractedNotice>(() => pending?.extraction.fields ?? {});
  const [saving, setSaving] = useState(false);

  /**
   * The field the screen opens focused on: the highest-risk one that actually
   * has a value to check. Computed once, from what was extracted — it must not
   * move as the user edits, or the cursor would jump around underneath them.
   */
  const [editing, setEditing] = useState<FieldKey | undefined>(() =>
    fieldNeedingAttention(pending?.extraction.fields ?? {}),
  );

  const setValue = useCallback((key: FieldKey, next: string) => {
    setFields((current) => ({
      ...current,
      // Marking it `manual` is what stops the screen re-flagging a field the
      // user has already looked at and fixed.
      [key]: { ...current[key], value: next, source: 'manual' as const },
    }));
  }, []);

  const save = useCallback(async () => {
    if (!pending) return;
    setSaving(true);

    // The stages that most need instrumenting happen here, not on Capture:
    // writing to SQLite, encrypting the photograph, and handing the ladder to
    // iOS. A failure in any of them loses the deadline the user just confirmed.
    const recorder = startTrace('camera', Date.now());
    try {

      const id = await recorder.step('save', async () => {
        const noticeId = await saveNotice({
          fields,
          // The scaffold extractor has no redaction matcher and says so, which is
          // why the OCR text is withheld rather than stored unredacted.
          redacted: pending.extraction.redacted,
          ...(pending.extraction.redacted ? { ocrText: pending.ocr.text } : {}),
          locale: i18n.language,
        });
        return { value: noticeId, detail: { redacted: pending.extraction.redacted } };
      });

      // The photograph is encrypted with the same key as the notice text, and the
      // camera's plaintext temporary file is deleted either way. A picture of the
      // letter carries the name, the address and the case number in plain sight —
      // encrypting the text and not the image would protect the copy and leave
      // the original.
      await recorder.step('encrypt-image', async () => {
        if (await getBooleanSetting(SETTINGS.deleteSourceImage)) {
          // Default: the photo's job ended when the text came out of it (SPEC §5).
          discardCapture(pending.photoUri);
          return { value: undefined, detail: { kept: false } };
        }
        const stored = await storeCaptureEncrypted(id, pending.photoUri);
        if (stored) await setImageRef(id, stored);
        return { value: undefined, detail: { kept: true, encrypted: stored !== undefined } };
      });

      const deadline = fields.deadlineDate?.value;
      const appPending = fields.aidPaidPendingDeadline?.value;
      const dates = {
        actionType: (fields.actionType?.value ?? 'recert_due') as ActionType,
        ...(deadline ? { deadlineDate: isoToLocalMs(deadline) } : {}),
        ...(appPending ? { aidPaidPendingDeadline: isoToLocalMs(appPending) } : {}),
      };

      // Verified in the Simulator on 2026-08-20: without authorisation iOS accepts
      // the schedule call and retains nothing — five reminders "scheduled", the OS
      // holding zero. So permission is checked first, and if it is refused the
      // notice is still saved but the user is told plainly that no reminder will
      // arrive. Silently saving a deadline that will never fire is the one
      // outcome this product cannot ship.
      // Asked here, not at launch: the user has just confirmed a deadline, so the
      // reason a reminder needs permission is on screen and obvious. A prompt on
      // first launch, before they have seen what the app does, gets declined.
      const granted = await recorder.step('schedule', async () => {
        if (!(await requestPermission())) return { value: false, detail: { permission: 'denied' } };
        const scheduled = await scheduleForNotice({
          noticeId: id,
          dates: dates as Parameters<typeof scheduleForNotice>[0]['dates'],
          ...(fields.programId?.value ? { programName: fields.programId.value } : {}),
        });
        await recordScheduled(id, scheduled);
        // What the OS actually holds, not what we asked it to hold. Verified on
        // 2026-08-20 that these can differ: without authorisation iOS accepts the
        // call and retains nothing.
        const held = await listScheduled();
        return {
          value: true,
          detail: {
            permission: 'granted',
            requested: scheduled.length,
            osHeld: held.length,
            tiers: scheduled.map((s) => s.tier).join(','),
          },
        };
      });
      if (!granted && deadline) {
        Alert.alert(t('review.noRemindersTitle'), t('review.noRemindersBody'));
      }


        clear();
        router.replace('/');
    } catch (error) {
      // A save that fails must not leave the button spinning forever, and the
      // user must be told rather than left looking at a screen that did
      // nothing. The trace says which stage broke.
      Alert.alert(t('review.saveFailedTitle'), t('review.saveFailedBody'));
      console.warn('[carta] save failed', error);
    } finally {
      // Kept whether it succeeded or not — a successful trace is what proves
      // the reminders were really registered with iOS.
      rememberTrace(recorder.trace());
      setSaving(false);
    }
  }, [pending, fields, clear, router, i18n.language, t]);

  if (!pending) {
    // Reached by opening Review with nothing in flight — a reload, or coming
    // back after a save. Says what happened rather than showing an empty form.
    return (
      <Screen footer={<Button title={t('common.back')} onPress={() => router.replace('/')} />}>
        <Text style={styles.emptyTitle}>{t('review.nothingTitle')}</Text>
        <Muted>{t('review.nothingBody')}</Muted>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            title={saving ? t('review.saving') : t('review.save')}
            busy={saving}
            onPress={() => void save()}
            accessibilityHint={t('review.saveHint')}
          />
          <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
        </>
      }
    >
      <Body>{t('review.intro')}</Body>

      {FIELD_ORDER.map((key) => {
        const field = fields[key];
        const risk = effectiveRisk(key, field);
        const isDate = DATE_FIELDS.includes(key);
        const isEditing = editing === key;
        const label = t(`review.fields.${key}`);
        const display =
          key === 'actionType' && field?.value
            ? t(`review.actions.${field.value}`, { defaultValue: field.value })
            : field?.value;
        const flagged = field?.invalid !== undefined && field.value !== undefined;
        const highRisk = risk === 'high' && field?.value !== undefined;

        return (
          <View
            key={key}
            style={[
              styles.field,
              highRisk && styles.fieldCheck,
              // `invalid` outranks: a value known to be wrong gets the full red.
              flagged && styles.fieldInvalid,
            ]}
          >
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{label}</Text>
              {/* Dates measured 100% precision on real photographs, so they are
                  presented as settled. Asking someone to re-verify nine fields
                  is how the one wrong field gets confirmed along with the rest. */}
              {risk === 'verified' && isDate && field?.value !== undefined ? (
                <Text style={styles.readClearly}>{t('review.readClearly')}</Text>
              ) : null}
            </View>

            {flagged ? (
              <Text style={styles.invalidText}>
                {t('review.invalidValue')} — {t('review.invalidWhy')}
              </Text>
            ) : highRisk ? (
              /* Says why, in the user's words. The app is telling them where it
                 is weakest, not reporting a confidence score. Amber, not red:
                 this fires on every notice, and if it looked like an error the
                 real errors would stop standing out. */
              <Text style={styles.checkText}>
                {t('review.checkThis')} — {t('review.checkThisWhy')}
              </Text>
            ) : null}

            {isEditing ? (
              <>
                <TextInput
                  autoFocus
                  value={field?.value ?? ''}
                  onChangeText={(next) => setValue(key, next)}
                  placeholder={isDate ? t('review.datePlaceholder') : ''}
                  placeholderTextColor={color.textFaint}
                  style={styles.input}
                  accessibilityLabel={label}
                  returnKeyType="done"
                  onSubmitEditing={() => setEditing(undefined)}
                />
                <Button title={t('review.done')} variant="secondary" onPress={() => setEditing(undefined)} />
              </>
            ) : (
              /* One tap from reading a field to fixing it. The screen is for
                 correction, so editing is not behind a menu. */
              <Pressable
                onPress={() => setEditing(key)}
                accessibilityRole="button"
                accessibilityLabel={
                  display ? t('review.editValue', { label, value: display }) : t('review.addValue', { label })
                }
                style={({ pressed }) => [styles.value, pressed && styles.valuePressed]}
              >
                <Text style={display ? styles.valueText : styles.valueMissing}>
                  {display ?? t('review.notFound')}
                </Text>
                <Text style={styles.editHint}>{t('review.edit')}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {fields.deadlineDate?.value === undefined ? (
        <View style={styles.noDeadline}>
          <Text style={styles.noDeadlineTitle}>{t('review.noDeadlineTitle')}</Text>
          <Body>{t('review.noDeadlineBody')}</Body>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyTitle: { ...type.title, color: color.text },

  field: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  fieldCheck: { borderColor: color.amber, borderWidth: 2 },
  fieldInvalid: { borderColor: color.red, borderWidth: 2, backgroundColor: color.redSoft },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  fieldLabel: { ...type.label, color: color.textMuted, flexShrink: 1 },
  readClearly: { ...type.caption, color: color.green },
  checkText: { ...type.body, color: color.amber, lineHeight: 23 },
  invalidText: { ...type.body, color: color.red, lineHeight: 23 },

  value: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    paddingVertical: space.sm,
  },
  valuePressed: { opacity: 0.6 },
  valueText: { ...type.heading, color: color.text, flexShrink: 1 },
  valueMissing: { ...type.body, color: color.textFaint, flexShrink: 1 },
  editHint: { ...type.label, color: color.accent },

  input: {
    ...type.heading,
    color: color.text,
    minHeight: touchTarget,
    borderBottomWidth: 2,
    borderBottomColor: color.accent,
    paddingVertical: space.sm,
  },

  noDeadline: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.amberSoft,
    borderWidth: 1,
    borderColor: color.amber,
  },
  noDeadlineTitle: { ...type.subheading, color: color.amber },
});
