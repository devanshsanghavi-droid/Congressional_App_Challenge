/**
 * Capture — photograph the notice, or open one you already took.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Unstyled: this is the thin spine (SPEC §9 week 2) and the design pass is
 * week 6. What has to be right now is the behaviour underneath.
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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { File, Paths } from 'expo-file-system';

import { CaptureError, runCapturePipeline } from '@/lib/capture/pipeline';
import type { CaptureOutcome } from '@/lib/capture/pipeline';
import { STAGE_HELP, formatTrace } from '@/lib/diagnostics/trace';
import type { CaptureTrace } from '@/lib/diagnostics/trace';
import { useCaptureStore } from '@/lib/store/capture';
import { Body, Button, Card, ErrorState, Muted, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/lib/theme/tokens';

type Phase = 'camera' | 'working' | 'done' | 'failed';

export default function CaptureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
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

  const takePhoto = useCallback(async () => {
    // Never to the camera roll (CLAUDE.md §3 rule 7) — the sandbox URI only.
    const shot = await camera.current?.takePictureAsync();
    if (shot) await run(shot.uri, 'camera');
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

  const reset = useCallback(() => {
    setOutcome(undefined);
    setFailure(undefined);
    setCopied(false);
    setPhase('camera');
  }, []);

  /**
   * DEV ONLY — run the pipeline on a staged file and go straight to Review.
   *
   * The Simulator cannot be tapped, so the only way to look at a *populated*
   * Review screen is to drive Capture to it. Write a filename into
   * `Documents/dev-autocapture.txt` and the file of that name in
   * `Documents/selftest/` goes through the real pipeline and proceeds.
   * Removed with the other dev affordances before freeze.
   */
  useEffect(() => {
    if (!__DEV__) return;
    const marker = new File(Paths.document, 'dev-autocapture.txt');
    if (!marker.exists) return;
    const name = marker.textSync().trim();
    marker.delete();
    const staged = new File(Paths.document, `selftest/${name}`);
    if (!staged.exists) return;
    const timer = setTimeout(() => void run(staged.uri, 'picker'), 0);
    return () => clearTimeout(timer);
  }, [run]);

  // Auto-proceed once the dev run finishes, so Review is reachable without a tap.
  useEffect(() => {
    if (!__DEV__ || phase !== 'done' || !outcome || outcome.trace.source !== 'picker') return;
    const marker = new File(Paths.document, 'dev-autoproceed.txt');
    if (!marker.exists) return;
    marker.delete();
    const timer = setTimeout(proceed, 0);
    return () => clearTimeout(timer);
  }, [phase, outcome, proceed]);

  if (!permission) return <View />;

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
      <Screen footer={<Button title={t('capture.retake')} onPress={reset} />}>
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

  if (!permission.granted) {
    return (
      <Screen
        footer={
          <>
            <Button title={t('capture.permissionGrant')} onPress={() => void requestPermission()} />
            {/* Declining is not a dead end — that is the whole point of a
                second way in. */}
            <Button
              title={t('capture.pickInstead')}
              variant="secondary"
              onPress={() => void pickPhoto()}
            />
          </>
        }
      >
        <Text style={styles.permissionTitle}>{t('capture.permissionTitle')}</Text>
        <Body>{t('capture.permissionBody')}</Body>
      </Screen>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <CameraView ref={camera} style={styles.camera} facing="back" />
      <View style={styles.cameraControls}>
        <Text style={styles.instruction}>{t('capture.instruction')}</Text>
        <Button title={t('capture.shutter')} onPress={() => void takePhoto()} />
        <Button title={t('capture.pickInstead')} variant="secondary" onPress={() => void pickPhoto()} />
      </View>
    </View>
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

  cameraScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: {
    padding: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
    backgroundColor: color.surface,
  },
  instruction: { ...type.body, color: color.textMuted, textAlign: 'center' },
});
