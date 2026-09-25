/**
 * Get a letter from a helper's phone.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7). The exchange itself is in
 * `src/lib/handoff/protocol.ts`, with its reasoning.
 *
 * Reachable from Home before any letter has been scanned, because that is
 * exactly when a family meets a helper. This phone shows a one-time code, the
 * helper's phone scans it, and then this phone scans the helper's looping
 * screen until it has every part.
 *
 * What arrives goes to Review, not to the database. The family checks every
 * field on their own phone before anything is saved or scheduled (CLAUDE.md §3
 * rule 6): it is their letter and their reminders, whoever read it first.
 */

import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { QrCode } from '@/components/QrCode';
import { QrScanner } from '@/components/QrScanner';
import { Body, Button, ErrorState, Muted, Screen } from '@/components/ui';
import { startTrace } from '@/lib/diagnostics/trace';
import { redactText } from '@/lib/extraction-port/adapter';
import { createReceiverSession, FrameCollector, openHandoff, receiverCode } from '@/lib/handoff/protocol';
import type { FrameProgress, ReceiverSession } from '@/lib/handoff/protocol';
import { useCaptureStore } from '@/lib/store/capture';
import { color, space, type } from '@/lib/theme/tokens';

type Phase = 'show' | 'scan' | 'failed';

const newSession = (): ReceiverSession => createReceiverSession((n) => Crypto.getRandomBytes(n));

export default function HandoffReceiveScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const setPending = useCaptureStore((s) => s.setPending);

  // One key pair per visit, in memory only. Leaving this screen forgets it,
  // and with it any way to read frames meant for it.
  const [session, setSession] = useState(newSession);
  const collector = useRef(new FrameCollector(session));
  const opened = useRef(false);
  const [phase, setPhase] = useState<Phase>('show');
  const [progress, setProgress] = useState<FrameProgress>();

  const restart = useCallback(() => {
    const next = newSession();
    collector.current = new FrameCollector(next);
    opened.current = false;
    setSession(next);
    setProgress(undefined);
    setPhase('show');
  }, []);

  const onCode = useCallback(
    (text: string) => {
      if (opened.current) return;
      const next = collector.current.accept(text);
      if (next === undefined) return;
      setProgress(next);
      if (!next.complete) return;

      opened.current = true;
      const result = openHandoff(collector.current, session);
      if (!result.ok) {
        setPhase('failed');
        return;
      }
      // Redacted on arrival as well as before sending: this phone does not
      // take another phone's word that it ran the matcher.
      const page = result.payload.ocrText === undefined ? undefined : redactText(result.payload.ocrText);
      setPending({
        photoUri: '',
        ocr: { lines: [], text: page?.text ?? '', width: 0, height: 0, engine: 'handoff' },
        extraction: {
          fields: result.payload.fields,
          requiredDocs: result.payload.requiredDocs,
          redacted: page !== undefined,
          ...(page?.containedSsn === true ? { containedSsn: true } : {}),
        },
        trace: startTrace('handoff', Date.now()).trace(),
        handoffCheckCode: result.checkCode,
      });
      router.replace('/review');
    },
    [session, setPending, router],
  );

  if (phase === 'failed') {
    return (
      <Screen footer={<Button title={t('handoff.startOver')} onPress={restart} />}>
        <ErrorState title={t('handoff.receiveTitle')} body={t('handoff.unreadable')} />
      </Screen>
    );
  }

  if (phase === 'scan') {
    return (
      <Screen footer={<Button title={t('handoff.cancel')} variant="secondary" onPress={() => router.back()} />}>
        <Body>{t('handoff.receiveStep2')}</Body>
        <QrScanner onCode={onCode} />
        {progress !== undefined && progress.total > 0 ? (
          <Text style={styles.progress} accessibilityLiveRegion="polite">
            {t('handoff.receiving', { have: progress.have, total: progress.total })}
          </Text>
        ) : null}
      </Screen>
    );
  }

  const size = Math.min(width - space.lg * 2, 360);
  return (
    <Screen
      footer={
        <>
          <Button title={t('handoff.scanTheirScreen')} onPress={() => setPhase('scan')} />
          <Button title={t('handoff.cancel')} variant="secondary" onPress={() => router.back()} />
        </>
      }
    >
      <Body>{t('handoff.receiveStep1')}</Body>
      <QrCode value={receiverCode(session)} size={size} label={t('handoff.receiveStep1')} />
      <Muted>{t('handoff.receiveStep2')}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { ...type.heading, color: color.text, textAlign: 'center' },
});
