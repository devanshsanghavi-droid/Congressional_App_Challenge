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
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { File, Paths } from 'expo-file-system';

import { CaptureError, runCapturePipeline } from '@/lib/capture/pipeline';
import type { CaptureOutcome } from '@/lib/capture/pipeline';
import { STAGE_HELP, formatTrace } from '@/lib/diagnostics/trace';
import type { CaptureTrace } from '@/lib/diagnostics/trace';
import { useCaptureStore } from '@/lib/store/capture';
import { Body, Button, Card, ErrorState, Muted, Screen } from '@/components/ui';
import { color, radius, space, touchTarget, type } from '@/lib/theme/tokens';

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

  if (!permission) return <View style={styles.cameraScreen} />;

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

        {/* TEMPORARY DEV INSTRUMENTATION — 2026-08-26, remove after the device
            session. A successful capture surfaces no trace anywhere: the copy
            button exists only on the failure branch, and
            `formatRememberedTraces()` has had no caller since fc33506. So on a
            physical phone there was no way to read `sourcePortrait`, which is
            the one number that says whether EXIF rotation was applied to a real
            `takePictureAsync` result. __DEV__ only; never in a release build. */}
        {__DEV__ ? (
          <Card>
            <Text style={styles.foundTitle}>trace (dev)</Text>
            <Text selectable style={{ fontFamily: 'Menlo', fontSize: 11 }}>
              {formatTrace(outcome.trace)}
            </Text>
          </Card>
        ) : null}

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
      <View style={styles.cameraFrame}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      {/* A document guide, not a crop. Carta wants the whole sheet — the frame
          is there to tell the user what to aim at, never to cut anything off.
          It is decorative, so it is hidden from screen readers.

          It lives INSIDE the camera view rather than over the whole screen.
          As a sibling filling the screen its lower half sat behind the controls
          panel and only the top two corners were ever visible — a document
          guide with two corners does not read as a guide at all. */}
      <View pointerEvents="none" style={styles.guide} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.guideCornerTopLeft} />
        <View style={styles.guideCornerTopRight} />
        <View style={styles.guideCornerBottomLeft} />
        <View style={styles.guideCornerBottomRight} />
        </View>
      </View>
      <View style={styles.cameraControls}>
        <Text style={styles.instruction}>{t('capture.instruction')}</Text>
        {/* The shutter is centred by the row; the picker is placed OVER the row
            rather than in it. The previous version put both in a
            `space-between` row and gave the picker `minWidth: 120` — but
            `minWidth` is a floor, not a cap, so the 16pt label expanded past it,
            the row overflowed its 338pt, and the text ran under the shutter.
            Taking the picker out of the layout flow means no label length can
            move the shutter. */}
        <View style={styles.shutterRow}>
          <Pressable
            onPress={() => void takePhoto()}
            accessibilityRole="button"
            accessibilityLabel={t('capture.shutter')}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => void pickPhoto()}
          accessibilityRole="button"
          accessibilityLabel={t('capture.pickInstead')}
          style={styles.pickButton}
        >
          <Text style={styles.pickButtonText} numberOfLines={2}>
            {t('capture.pickInstead')}
          </Text>
        </Pressable>
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
  /** The preview, and the only thing the guide is allowed to overlay. */
  cameraFrame: { flex: 1 },

  // A document-shaped guide with four corner brackets. Decorative and
  // non-interactive: it sits over the preview to say "fit the page in here",
  // and never crops.
  guide: {
    ...StyleSheet.absoluteFill,
    margin: space.xl,
  },
  guideCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
    borderTopLeftRadius: radius.md,
  },
  guideCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
    borderTopRightRadius: radius.md,
  },
  guideCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
    borderBottomLeftRadius: radius.md,
  },
  guideCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)',
    borderBottomRightRadius: radius.md,
  },

  cameraControls: {
    padding: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
    backgroundColor: color.surface,
  },
  instruction: { ...type.body, color: color.textMuted, textAlign: 'center' },

  shutterRow: { alignItems: 'center' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.7 },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.text,
  },
  /**
   * Absolutely positioned, left of the centred shutter, with a right edge that
   * stops clear of it: 402pt screen, 76pt shutter centred, so the shutter's left
   * edge is at 163. Ending at 150 leaves a 13pt gutter no label can cross.
   */
  pickButton: {
    position: 'absolute',
    left: space.lg,
    right: undefined,
    bottom: space.xl,
    maxWidth: 150 - space.lg,
    minHeight: touchTarget,
    justifyContent: 'center',
  },
  pickButtonText: { ...type.bodyStrong, color: color.accent },
});
