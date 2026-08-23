/**
 * The capture pipeline — one traced path, whatever the image came from.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Camera, photo picker and the dev self-test all call this. That is the point:
 * the fallback path and the demo path must not be two different pipelines that
 * drift, and a bug found through the picker must be the same bug the camera
 * has.
 *
 * Everything is wrapped in a trace, because this runs on a phone where the
 * interesting failures are not exceptions — an image that resized wrong, OCR
 * that returned four lines, an orientation verdict computed from unrotated
 * boxes. Those all succeed. See `../diagnostics/trace.ts`.
 */

import { checkOrientation, shouldWarnUpsideDown } from '../ocr/orientation.ts';
import type { OrientationCheck } from '../ocr/orientation.ts';
import { recognize } from '../ocr/recognize.ts';
import type { OcrResult } from '../ocr/types.ts';
import { extractNotice } from '../extraction-port/adapter.ts';
import type { ExtractionResult } from '../extraction-port/port.ts';
import { startTrace } from '../diagnostics/trace.ts';
import type { CaptureTrace, TraceRecorder } from '../diagnostics/trace.ts';

/**
 * An error with the trace attached.
 *
 * The trace is the useful part of a failure, so it travels with the exception
 * rather than being reconstructed by the caller. `instanceof` still works for
 * whatever the underlying error was, because the original is kept as `cause`.
 */
export class CaptureError extends Error {
  readonly trace: CaptureTrace;
  constructor(trace: CaptureTrace, cause: unknown) {
    super(`capture failed at ${trace.failedAt ?? 'unknown stage'}`, { cause });
    this.name = 'CaptureError';
    this.trace = trace;
  }
}

export interface CaptureOutcome {
  readonly photoUri: string;
  readonly ocr: OcrResult;
  readonly orientation: OrientationCheck;
  readonly upsideDown: boolean;
  readonly extraction: ExtractionResult;
  readonly trace: CaptureTrace;
}

/**
 * Read an image and get as far as extracted fields. Never saves — the user has
 * not confirmed anything yet (CLAUDE.md §4 rule 6).
 */
export async function runCapturePipeline(
  photoUri: string,
  source: CaptureTrace['source'],
): Promise<CaptureOutcome> {
  const recorder = startTrace(source, Date.now());
  try {
    return await runStages(photoUri, recorder);
  } catch (error) {
    throw new CaptureError(recorder.trace(), error);
  }
}

async function runStages(
  photoUri: string,
  recorder: TraceRecorder,
): Promise<CaptureOutcome> {
  const ocr = await recorder.step('ocr', async () => {
    const result = await recognize(photoUri);
    const { prepared } = result;
    return {
      value: result,
      detail: {
        // The EXIF question. A portrait photo whose *source* reads as landscape
        // means the rotation was not applied, and every bounding box below it
        // is on its side. This is the single most likely way the camera path
        // differs from every file the pipeline has been fed so far.
        sourceWidth: prepared.sourceWidth,
        sourceHeight: prepared.sourceHeight,
        sourcePortrait: prepared.sourceHeight > prepared.sourceWidth,
        ocrWidth: prepared.width,
        ocrHeight: prepared.height,
        engine: result.engine,
        lines: result.lines.length,
        characters: result.text.length,
      },
    };
  });

  const orientation = await recorder.step('orientation', async () => {
    const check = checkOrientation(ocr.lines);
    return {
      value: check,
      detail: {
        verdict: check.orientation,
        anchors: check.anchorCount,
        // Rounded: this is read on a phone screen, and three decimals is well
        // past the resolution of a threshold set at 0.5. -1 rather than omitted
        // so a missing anchor shows as a value, not an absent line.
        anchorPosition:
          check.anchorPosition === undefined ? -1 : Number(check.anchorPosition.toFixed(3)),
      },
    };
  });

  const extraction = await recorder.step('extract', async () => {
    const result = extractNotice({
      lines: ocr.lines,
      text: ocr.text,
      width: ocr.width,
      height: ocr.height,
      nowMs: Date.now(),
    });
    const found = Object.values(result.fields).filter((field) => field?.value).length;
    return {
      value: result,
      detail: {
        fieldsFound: found,
        // The value, because a wrong deadline is the failure that matters and
        // it is worth seeing in the trace. Names and case numbers are reported
        // as found/none only — a trace should be safe to paste into a message.
        deadline: result.fields.deadlineDate?.value ?? 'none',
        recipient: result.fields.recipientName?.value === undefined ? 'none' : 'found',
        caseNumber: result.fields.caseNumber?.value === undefined ? 'none' : 'found',
        redacted: result.redacted,
      },
    };
  });

  return {
    photoUri,
    ocr,
    orientation,
    upsideDown: shouldWarnUpsideDown(orientation),
    extraction,
    trace: recorder.trace(),
  };
}
