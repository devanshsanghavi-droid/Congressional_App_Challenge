/**
 * Capture — photograph the notice, or open one you already took.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Two ways in, one pipeline. The camera is the demo path; the picker is the
 * fallback for someone who already photographed the letter, or whose hands are
 * full, and it is the path that works when the camera does not. They share
 * `runCapturePipeline` so a bug found in one is the same bug in the other.
 *
 * Every run is traced. This screen is the first place on a real phone where the
 * input is a 12-megapixel frame with an EXIF orientation tag rather than a file
 * a script put on disk, and the failures that matter there are not exceptions —
 * they are an image that resized wrong, or OCR that returned four lines. So a
 * failure shows *which stage* broke and offers the trace to copy.
 */

import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';


import { CaptureError, runCapturePipeline } from '@/lib/capture/pipeline';
import type { CaptureOutcome } from '@/lib/capture/pipeline';
import { STAGE_HELP, formatTrace } from '@/lib/diagnostics/trace';
import type { CaptureTrace } from '@/lib/diagnostics/trace';
import { useCaptureStore } from '@/lib/store/capture';
import { Body, Button, Card, ErrorState, Muted, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/lib/theme/tokens';

type Phase = 'choose' | 'working' | 'done' | 'failed' | 'denied';

export default function CaptureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('choose');
  const [outcome, setOutcome] = useState<CaptureOutcome>();
  const [failure, setFailure] = useState<{ trace: CaptureTrace; message: string }>();
  const [copied, setCopied] = useState(false);
  const setPending = useCaptureStore((s) => s.setPending);

  const run = useCallback(async (uri: string, source: 'camera' | 'picker') => {
    setPhase('working');
    setCopied(false);
    try {
      setOutcome(await runCapturePipeline(uri, source));
      setPhase('done');
    } catch (error) {
      // The trace is the useful artefact, not the exception. It says which
      // stage broke and what the stages before it produced.
      const trace =
        error instanceof CaptureError
          ? error.trace
          : { id: 'unknown', startedAt: Date.now(), source, stages: [] };
      const stage = trace.failedAt;
      setFailure({ trace, message: stage ? t(STAGE_HELP[stage]) : String(error) });
      setPhase('failed');
    }
  }, [t]);

  /**
   * Apple's own camera, via `launchCameraAsync`.
   *
   * The custom `expo-camera` preview was replaced on 2026-08-26 after it was
   * used on a real phone: it could not focus on a page unless you backed away
   * from it, and it had no zoom. That gap is not tunable — `expo-camera`
   * exposes no tap-to-focus API at all, so the single most important control
   * for photographing a letter was unavailable at any price. It was also
   * completely unconfigured: no autofocus prop, and `takePictureAsync()` called
   * with no options, so every shot was default quality.
   *
   * The system camera brings continuous autofocus, tap-to-focus, pinch zoom,
   * flash and exposure, and every user already knows how to drive it. The
   * framing guide is the only thing lost, and a guide is worth less than focus.
   *
   * Still never to the camera roll (CLAUDE.md §3 rule 7): this returns a URI in
   * the app's own cache and the pipeline copies from there.
   */
  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhase('denied');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // No editing UI, same reason as the library path: cropping the page is how
      // someone accidentally cuts off the deadline.
      allowsEditing: false,
      quality: 1,
    });
    if (!shot.canceled && shot.assets[0]) await run(shot.assets[0].uri, 'camera');
  }, [run]);

  const pickPhoto = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // No editing UI: cropping the page is how someone accidentally cuts off
      // the deadline. Carta wants the whole sheet.
      allowsEditing: false,
      quality: 1,
    });
    if (!picked.canceled && picked.assets[0]) await run(picked.assets[0].uri, 'picker');
  }, [run]);

  const proceed = useCallback(() => {
    if (!outcome) return;
    setPending({
      photoUri: outcome.photoUri,
      ocr: outcome.ocr,
      extraction: outcome.extraction,
      trace: outcome.trace,
    });
    router.push('/review');
  }, [outcome, setPending, router]);

  const copyTrace = useCallback(async (trace: CaptureTrace) => {
    await Clipboard.setStringAsync(formatTrace(trace));
    setCopied(true);
  }, []);

  /**
   * Out of the flow entirely, back to Home.
   *
   * Every footer on this screen has one. Before 2026-08-26 the result screen
   * offered only "Use this photo" and "Take it again" — two ways forward and no
   * way out — and a real user on a real phone could not get back, because the
   * only escape was the system chevron in the top-left corner and the footer is
   * where the thumb goes.
   */
  const cancel = useCallback(() => router.replace('/'), [router]);

  const reset = useCallback(() => {
    setOutcome(undefined);
    setFailure(undefined);
    setCopied(false);
    setPhase('choose');
  }, []);

  if (phase === 'working') {
    // OCR takes 1.7-2.8s on real captures, which is long enough that silence
    // reads as a hang and gets tapped again. The second line says what is
    // happening so the wait is legible rather than merely occupied.
    return (
      <Screen scroll={false}>
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={color.accent} />
          <Text style={styles.workingTitle}>{t('capture.reading')}</Text>
          <Muted>{t('capture.readingBody')}</Muted>
        </View>
      </Screen>
    );
  }

  if (phase === 'failed' && failure) {
    return (
      <Screen
        footer={
          <>
            <Button title={t('capture.retake')} onPress={reset} />
            <Button title={t('capture.cancelToHome')} variant="secondary" onPress={cancel} />
          </>
        }
      >
        <ErrorState title={t('capture.failedTitle')} body={failure.message} />
        {/* The trace carries no notice content — stage names, timings, counts —
            so offering it to copy is safe. Behind a button rather than on
            screen: it is for us, not for the person holding the phone. */}
        <Button
          title={copied ? t('capture.traceCopied') : t('capture.copyTrace')}
          variant="quiet"
          onPress={() => void copyTrace(failure.trace)}
        />
      </Screen>
    );
  }

  if (phase === 'done' && outcome) {
    const lineCount = outcome.ocr.lines.length;
    const usable = lineCount > 0;
    return (
      <Screen
        footer={
          <>
            {usable ? (
              <Button
                title={outcome.upsideDown ? t('capture.upsideDownIgnore') : t('capture.usePhoto')}
                onPress={proceed}
              />
            ) : null}
            <Button title={t('capture.retake')} variant="secondary" onPress={reset} />
            <Button title={t('capture.cancelToHome')} variant="quiet" onPress={cancel} />
          </>
        }
      >
        <Image
          source={{ uri: outcome.photoUri }}
          style={styles.preview}
          accessibilityLabel={t('capture.previewAlt')}
        />

        {usable ? (
          <View style={styles.found}>
            <Text style={styles.foundTitle}>{t('capture.textFound')}</Text>
            <Muted>{t('capture.linesFound', { count: lineCount })}</Muted>
          </View>
        ) : (
          <ErrorState title={t('capture.noTextTitle')} body={t('capture.noTextBody')} />
        )}

        {/* The warning that saves the extraction. An inverted page still reads
            at full confidence, so nothing else on this screen would tell them. */}
        {outcome.upsideDown ? (
          <Card style={styles.warning}>
            <Text style={styles.warningTitle}>{t('capture.upsideDownTitle')}</Text>
            <Body>{t('capture.upsideDownBody')}</Body>
          </Card>
        ) : null}
      </Screen>
    );
  }

  if (phase === 'denied') {
    return (
      <Screen
        footer={
          <>
            {/* Declining the camera is not a dead end - that is the point of a
                second way in, and it is a full-size button, not a text link. */}
            <Button title={t('capture.chooseLibrary')} onPress={() => void pickPhoto()} />
            <Button title={t('capture.cancelToHome')} variant="secondary" onPress={cancel} />
          </>
        }
      >
        <Text style={styles.permissionTitle}>{t('capture.permissionTitle')}</Text>
        <Body>{t('capture.permissionBody')}</Body>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {/* Two equal buttons. The library path used to be a small text link
              beside a 76pt shutter, which made it invisible in practice - the
              person it was built for could not find it while using the app. */}
          <Button title={t('capture.takePhoto')} onPress={() => void takePhoto()} />
          <Button
            title={t('capture.chooseLibrary')}
            variant="secondary"
            onPress={() => void pickPhoto()}
          />
          <Button title={t('capture.cancelToHome')} variant="quiet" onPress={cancel} />
        </>
      }
    >
      <Text style={styles.permissionTitle}>{t('capture.chooseTitle')}</Text>
      <Body>{t('capture.chooseBody')}</Body>
    </Screen>
  );
}


const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  workingTitle: { ...type.heading, color: color.text, textAlign: 'center' },

  preview: {
    width: '100%',
    height: 320,
    resizeMode: 'contain',
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },

  found: { gap: 2 },
  foundTitle: { ...type.subheading, color: color.green },

  warning: { backgroundColor: color.redSoft, borderColor: color.red, borderWidth: 1 },
  warningTitle: { ...type.heading, color: color.red },

  permissionTitle: { ...type.title, color: color.text },

  /** The preview, and the only thing the guide is allowed to overlay. */

  // A document-shaped guide with four corner brackets. Decorative and
  // non-interactive: it sits over the preview to say "fit the page in here",
  // and never crops.


  /**
   * Absolutely positioned, left of the centred shutter, with a right edge that
   * stops clear of it: 402pt screen, 76pt shutter centred, so the shutter's left
   * edge is at 163. Ending at 150 leaves a 13pt gutter no label can cross.
   */
});
