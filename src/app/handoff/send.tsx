/**
 * Send a confirmed letter to the family's phone, from a helper's phone.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7). The exchange itself is in
 * `src/lib/handoff/protocol.ts`, with its reasoning.
 *
 * Reached from Review, after the helper has checked the fields. Two steps: scan
 * the family's code, then hold up a looping QR code until their phone has every
 * part. Then "Done" deletes the photo from this phone's cache and goes Home
 * without saving anything. A navigator who helps twenty families a week should
 * not end the week carrying twenty families' letters.
 */

import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { QrScanner } from '@/components/QrScanner';
import { Body, Button, Caption, EmptyState, Muted, Screen } from '@/components/ui';
import { discardCapture } from '@/lib/db/images';
import { redactText } from '@/lib/extraction-port/adapter';
import { sealForReceiver } from '@/lib/handoff/protocol';
import type { HandoffPayload, SealedHandoff } from '@/lib/handoff/protocol';
import { useCaptureStore } from '@/lib/store/capture';
import { color, radius, space, type } from '@/lib/theme/tokens';

/** How long each frame stays up. Long enough for the other camera to settle, short enough that a loop is a few seconds. */
const FRAME_MS = 300;

export default function HandoffSendScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const pending = useCaptureStore((s) => s.pending);
  const clear = useCaptureStore((s) => s.clear);

  const [sealed, setSealed] = useState<SealedHandoff>();
  const [notCarta, setNotCarta] = useState(false);
  const [frame, setFrame] = useState(0);

  const onCode = useCallback(
    (text: string) => {
      if (sealed !== undefined || pending === undefined) return;
      const payload: HandoffPayload = {
        v: 1,
        fields: pending.extraction.fields,
        requiredDocs: pending.extraction.requiredDocs ?? [],
        // Redacted again here: this text is about to leave the phone, and the
        // rule is the same as for writing it to disk (CLAUDE.md §3 rule 5).
        ...(pending.extraction.redacted ? { ocrText: redactText(pending.ocr.text).text } : {}),
        locale: i18n.language,
      };
      const result = sealForReceiver(payload, text, (n) => Crypto.getRandomBytes(n));
      if (result === undefined) {
        setNotCarta(true);
        return;
      }
      setNotCarta(false);
      setSealed(result);
    },
    [sealed, pending, i18n.language],
  );

  useEffect(() => {
    if (sealed === undefined) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % sealed.frames.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [sealed]);

  const finish = useCallback(() => {
    if (pending !== undefined && pending.photoUri !== '') discardCapture(pending.photoUri);
    clear();
    Alert.alert(t('handoff.nothingSaved'));
    router.replace('/');
  }, [pending, clear, router, t]);

  if (pending === undefined) {
    return (
      <Screen footer={<Button title={t('common.back')} onPress={() => router.replace('/')} />}>
        <EmptyState title={t('review.nothingTitle')} body={t('review.nothingBody')} />
      </Screen>
    );
  }

  if (sealed === undefined) {
    return (
      <Screen footer={<Button title={t('handoff.cancel')} variant="secondary" onPress={() => router.back()} />}>
        <Body>{t('handoff.sendStep1')}</Body>
        <Text style={styles.label}>{t('handoff.scanTheirCode')}</Text>
        <QrScanner onCode={onCode} />
        {notCarta ? <Body>{t('handoff.notCarta')}</Body> : null}
      </Screen>
    );
  }

  const size = Math.min(width - space.lg * 2, 420);
  const current = sealed.frames[frame] ?? sealed.frames[0] ?? '';
  return (
    <Screen
      footer={
        <>
          <Button title={t('handoff.sendDone')} onPress={finish} />
          <Button title={t('handoff.cancel')} variant="secondary" onPress={() => router.back()} />
        </>
      }
    >
      <Body>{t('handoff.sendStep2')}</Body>
      <QrCode value={current} size={size} label={t('handoff.sendStep2')} />
      <View style={styles.code}>
        <Text style={styles.codeText}>{t('handoff.checkCode', { code: sealed.checkCode })}</Text>
        <Muted>{t('handoff.checkCodeHelp')}</Muted>
      </View>
      <Caption>{t('disclaimer.notLegalAdvice')}</Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: color.textMuted },
  code: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.accentSoft,
  },
  codeText: { ...type.heading, color: color.text },
});
