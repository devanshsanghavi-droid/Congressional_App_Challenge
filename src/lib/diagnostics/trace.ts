/**
 * Stage-by-stage trace of one capture.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7). Pure — no imports, so it is
 * testable in bare Node.
 *
 * WHY
 * ---
 * The camera path has never run. Everything proven so far — OCR, orientation,
 * extraction, storage, scheduling — was proven downstream of a file that was
 * already on disk, put there by a script. On a real phone the input arrives
 * through `expo-camera`, at 12 megapixels, with an EXIF orientation tag, from a
 * URI shape nothing here has seen.
 *
 * So when it fails on the device, "it didn't work" is useless and a stack trace
 * is nearly as bad, because the interesting failures here are not exceptions:
 * an image that resizes to the wrong dimensions, OCR that returns four lines
 * instead of thirty-five, an orientation verdict computed from boxes that were
 * never rotated. Those all *succeed*.
 *
 * Every stage therefore records what it produced, not just whether it threw.
 * The numbers are the diagnosis: if `resize` reports 4032×3024 the EXIF
 * rotation did not apply; if `ocr` reports 3 lines the recogniser got a blurred
 * frame; if `orientation` reports `unknown` the anchors were not found.
 */

export type StageName =
  | 'acquire'
  | 'resize'
  | 'ocr'
  | 'orientation'
  | 'extract'
  | 'save'
  | 'checklist'
  | 'encrypt-image'
  | 'schedule';

export interface StageRecord {
  readonly stage: StageName;
  readonly ok: boolean;
  readonly ms: number;
  /** Whatever this stage learned. Numbers, not prose. */
  readonly detail: Readonly<Record<string, string | number | boolean>>;
  readonly error?: string;
}

export interface CaptureTrace {
  readonly id: string;
  readonly startedAt: number;
  readonly source: 'camera' | 'picker' | 'selftest';
  readonly stages: readonly StageRecord[];
  /** The first stage that failed, if any. */
  readonly failedAt?: StageName;
}

export interface TraceRecorder {
  /** Run `work`, timing it and recording whatever detail it returns. */
  step: <T>(
    stage: StageName,
    work: () => Promise<{ value: T; detail?: Record<string, string | number | boolean> }>,
  ) => Promise<T>;
  readonly trace: () => CaptureTrace;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    // The message alone is often enough and the stack is unreadable on a phone,
    // but native module errors put the useful part in the cause.
    const cause = error.cause === undefined ? '' : ` (cause: ${String(error.cause)})`;
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

export function startTrace(source: CaptureTrace['source'], nowMs: number): TraceRecorder {
  const stages: StageRecord[] = [];
  const startedAt = nowMs;
  let failedAt: StageName | undefined;

  return {
    async step(stage, work) {
      const began = Date.now();
      try {
        const { value, detail } = await work();
        stages.push({ stage, ok: true, ms: Date.now() - began, detail: detail ?? {} });
        return value;
      } catch (error) {
        stages.push({
          stage,
          ok: false,
          ms: Date.now() - began,
          detail: {},
          error: errorText(error),
        });
        failedAt ??= stage;
        throw error;
      }
    },
    trace: () => ({
      id: `t_${startedAt.toString(36)}`,
      startedAt,
      source,
      stages: [...stages],
      ...(failedAt === undefined ? {} : { failedAt }),
    }),
  };
}

/**
 * The trace as a block of text to paste back.
 *
 * Deliberately plain and narrow — it is read on a phone screen and pasted into
 * a message, so no JSON and no lines longer than about sixty characters.
 *
 * Contains no notice content: stage names, timings, dimensions and counts only.
 * A trace can be shared without sharing anyone's benefit letter, which is the
 * whole reason it is safe to offer a "copy" button at all.
 */
export function formatTrace(trace: CaptureTrace): string {
  const lines: string[] = [
    `carta capture trace ${trace.id}`,
    `source: ${trace.source}`,
    `result: ${trace.failedAt === undefined ? 'completed' : `FAILED at ${trace.failedAt}`}`,
    '',
  ];
  for (const stage of trace.stages) {
    lines.push(`${stage.ok ? 'ok  ' : 'FAIL'} ${stage.stage.padEnd(14)} ${stage.ms}ms`);
    for (const [key, value] of Object.entries(stage.detail)) {
      lines.push(`       ${key}: ${String(value)}`);
    }
    if (stage.error !== undefined) lines.push(`       error: ${stage.error}`);
  }
  const total = trace.stages.reduce((sum, stage) => sum + stage.ms, 0);
  lines.push('', `total: ${total}ms`);
  return lines.join('\n');
}

/**
 * What to tell the user when a stage fails.
 *
 * Every one names something they can do. "Extraction failed" is not actionable;
 * "Carta could not read the writing — try again with more light" is. The
 * technical detail goes in the trace, which is for us.
 */
export const STAGE_HELP: Readonly<Record<StageName, string>> = {
  acquire: 'capture.errorAcquire',
  resize: 'capture.errorResize',
  ocr: 'capture.errorOcr',
  orientation: 'capture.errorOrientation',
  extract: 'capture.errorExtract',
  save: 'capture.errorSave',
  // The notice and its reminders are already saved by this point, so a failure
  // here costs the checklist and nothing the deadline depends on. It reads as a
  // save failure to the user because that is what it is, from where they stand.
  checklist: 'capture.errorSave',
  'encrypt-image': 'capture.errorSave',
  schedule: 'capture.errorSchedule',
};
