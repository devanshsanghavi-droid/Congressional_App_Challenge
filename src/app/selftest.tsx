/**
 * DEV TOOL — end-to-end acceptance test. Delete before freeze, with bench.tsx.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Runs the real thin spine over real corpus photographs, on device or in the
 * Simulator, and writes a report the harness can read back:
 *
 *   image on disk → recognize() → orientation check → extract() → saveNotice()
 *   → scheduleForNotice() → a proof notification a few seconds out
 *
 * Every call is the same one the Capture and Review screens make. Nothing here
 * is mocked; the only thing it skips is the tapping.
 *
 * WHY IT READS FROM THE SANDBOX RATHER THAN THE PHOTO LIBRARY
 * ----------------------------------------------------------
 * Driving the system photo picker needs a human to tap it, and CLAUDE.md §3
 * rule 7 keeps this app out of MediaLibrary entirely. So images are copied
 * straight into the app container:
 *
 *   xcrun simctl get_app_container booted com.devanshsanghavi.carta data
 *   cp tools/corpus/photos/sar7-clean-01.jpg "$CONTAINER/Documents/selftest/"
 *   xcrun simctl openurl booted carta://selftest
 *
 * That exercises `recognize(uri)` on exactly the URI shape the camera produces.
 * What it does *not* exercise is the picker sheet itself — worth saying plainly
 * rather than claiming a fuller test than this is.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { saveNotice, setImageRef } from '@/lib/db/notices';
import { discardCapture, plaintextRemains, storeCaptureEncrypted } from '@/lib/db/images';
import { getBooleanSetting, SETTINGS } from '@/lib/db/settings';
import { recordScheduled } from '@/lib/db/reminders';
import type { FieldKey } from '@/lib/extraction-port/port';
import { FIELD_ORDER } from '@/lib/extraction-port/port';
import { listScheduled, requestPermission, scheduleForNotice, scheduleProof } from '@/lib/notifications';
import { runCapturePipeline } from '@/lib/capture/pipeline';
import { formatTrace } from '@/lib/diagnostics/trace';
import type { ActionType } from '@/lib/urgency';

interface CaseReport {
  image: string;
  ok: boolean;
  error?: string;
  ocrLines?: number;
  ocrWidth?: number;
  engine?: string;
  orientation?: string;
  anchorPosition?: number;
  fields?: Record<string, string | null>;
  /** First lines in the order the device returned them — diagnoses ordering bugs. */
  firstLines?: string[];
  trace?: string;
  noticeId?: string;
  /** Privacy checks, run on the real files rather than asserted in prose. */
  capturePlaintextRemains?: boolean;
  captureStoredEncrypted?: boolean;
  remindersScheduled?: number;
  reminderTiers?: string[];
}

export default function SelfTestScreen() {
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const append = useCallback((line: string) => {
    setLog((current) => [...current, line]);
    console.log(`[selftest] ${line}`);
  }, []);

  const run = useCallback(async () => {
    const reports: CaseReport[] = [];
    const inbox = new Directory(Paths.document, 'selftest');

    if (!inbox.exists) {
      append(`no images: ${inbox.uri} does not exist`);
      setDone(true);
      return;
    }

    const images = inbox
      .list()
      // HEIC as well as JPEG: a real iPhone capture is HEIC, and converting it
      // first would launder exactly the properties this fixture exists to test.
      .filter((entry): entry is File => entry instanceof File && /\.(jpe?g|heic|png)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    append(`found ${images.length} image(s)`);

    for (const image of images) {
      const report: CaseReport = { image: image.name, ok: false };
      try {
        append(`--- ${image.name} ---`);

        // Exactly the pipeline the camera and the picker run, so the self-test
        // cannot pass on a path the product does not take.
        const outcome = await runCapturePipeline(image.uri, 'selftest');
        const { ocr, orientation, extraction: extracted } = outcome;
        report.ocrLines = ocr.lines.length;
        report.ocrWidth = ocr.width;
        report.engine = ocr.engine;
        report.orientation = orientation.orientation;
        if (orientation.anchorPosition !== undefined) {
          report.anchorPosition = Number(orientation.anchorPosition.toFixed(3));
        }
        report.trace = formatTrace(outcome.trace);
        append(`ocr: ${ocr.lines.length} lines at ${ocr.width}px via ${ocr.engine}`);
        append(`orientation: ${orientation.orientation} (anchors ${orientation.anchorCount})`);

        const fields: Record<string, string | null> = {};
        for (const key of FIELD_ORDER) {
          fields[key] = extracted.fields[key as FieldKey]?.value ?? null;
        }
        report.fields = fields;
        report.firstLines = ocr.lines.slice(0, 14).map((l, i) => `${i}: ${l.text}`);
        append(`extracted deadline=${fields['deadlineDate']} case=${fields['caseNumber']}`);

        // Copy to a scratch path first so the pipeline runs against a file it
        // is allowed to delete — the staged originals have to survive for the
        // next run. This is the same shape the camera produces: a temporary
        // file the app owns.
        const capture = new File(Paths.cache, `capture-${image.name}`);
        if (capture.exists) capture.delete();
        image.copy(capture);

        const noticeId = await saveNotice({
          fields: extracted.fields,
          redacted: extracted.redacted,
          ...(extracted.redacted ? { ocrText: ocr.text } : {}),
          locale: 'en',
        });
        report.noticeId = noticeId;
        append(`saved: ${noticeId}`);

        // The same branch Review takes, so the privacy path is actually
        // exercised rather than described.
        if (await getBooleanSetting(SETTINGS.deleteSourceImage)) {
          discardCapture(capture.uri);
          report.captureStoredEncrypted = false;
        } else {
          const stored = await storeCaptureEncrypted(noticeId, capture.uri);
          if (stored) await setImageRef(noticeId, stored);
          report.captureStoredEncrypted = stored !== undefined;
        }
        report.capturePlaintextRemains = plaintextRemains(capture.uri);
        append(
          `capture: encrypted=${String(report.captureStoredEncrypted)} ` +
            `plaintextRemains=${String(report.capturePlaintextRemains)}`,
        );

        const deadline = extracted.fields.deadlineDate?.value;
        const scheduled = await scheduleForNotice({
          noticeId,
          dates: {
            actionType: (extracted.fields.actionType?.value ?? 'recert_due') as ActionType,
            ...(deadline
              ? {
                  deadlineDate: new Date(
                    Number(deadline.slice(0, 4)),
                    Number(deadline.slice(5, 7)) - 1,
                    Number(deadline.slice(8, 10)),
                  ).getTime(),
                }
              : {}),
          },
          ...(extracted.fields.programId?.value
            ? { programName: extracted.fields.programId.value }
            : {}),
        });
        await recordScheduled(noticeId, scheduled);
        report.remindersScheduled = scheduled.length;
        report.reminderTiers = scheduled.map((s) => s.tier);
        append(`reminders scheduled: ${scheduled.length} [${scheduled.map((s) => s.tier).join(', ')}]`);

        report.ok = true;
      } catch (error) {
        report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        append(`FAILED: ${report.error}`);
      }
      reports.push(report);
    }

    // Scheduling is verifiable without display authorisation: iOS registers the
    // request either way, so this proves the ladder reached the OS.
    const pending = await listScheduled();
    append(`OS reports ${pending.length} scheduled notification(s)`);

    const outFile = new File(Paths.document, 'selftest-report.json');
    outFile.write(
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          osScheduledCount: pending.length,
          cases: reports,
        },
        null,
        2,
      ),
    );
    append(`report written: ${outFile.uri}`);
    setDone(true);

    // LAST, deliberately. Requesting authorisation puts a modal system prompt on
    // screen, and in the Simulator there is no way to dismiss it from the
    // command line — `simctl privacy` has no `notifications` service and there
    // is no tap injection. Doing it here means a blocked prompt costs only the
    // visible-banner proof, not the pipeline results, which are already on disk.
    // Provisional: granted without a prompt, so the scheduling path can be
    // verified in the Simulator with no human to tap "Allow". Delivery is quiet
    // (Notification Center rather than a banner), which is enough to prove the
    // OS accepted and retained the request.
    const granted = await requestPermission({ provisional: true });
    append(`notification permission (provisional): ${granted ? 'granted' : 'not granted'}`);
    if (granted) {
      const proofId = await scheduleProof(5, 'CalFresh');
      append(`proof notification scheduled 5s out: ${proofId}`);
      // Re-read AFTER authorisation: the earlier count is taken before any
      // permission exists, and iOS retains nothing until it does.
      const after = await listScheduled();
      append(`OS now holds ${after.length} scheduled notification(s)`);
      const outAfter = new File(Paths.document, 'selftest-scheduled.json');
      outAfter.write(JSON.stringify({ granted, osHeld: after.length, proofId }, null, 2));
    }
  }, [append]);

  useEffect(() => {
    // Deferred by a tick rather than called straight from the effect body: the
    // first thing `run` does is append a log line, and setState synchronously
    // inside an effect triggers a cascading render (React Compiler flags it).
    const timer = setTimeout(() => void run(), 0);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>
        {done ? 'Self-test complete' : 'Running self-test…'}
      </Text>
      {log.map((line, i) => (
        <Text key={i} style={{ fontSize: 12, fontFamily: 'Courier' }}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
