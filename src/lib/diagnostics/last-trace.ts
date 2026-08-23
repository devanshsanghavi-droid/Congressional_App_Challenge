/**
 * The most recent capture traces, held in memory.
 *
 * AUTHORSHIP: Claude. App-side. Development aid — removed with the dev screens
 * before freeze.
 *
 * A trace is most useful *after* the screen that produced it has gone. Review
 * navigates to Home the moment a save succeeds, which is exactly when someone
 * testing on a physical phone wants to read what happened. So traces are kept
 * here and copied from Home.
 *
 * In memory only, never persisted: a trace contains no notice content, but it
 * is diagnostic exhaust and there is no reason for it to outlive the session.
 */

import type { CaptureTrace } from './trace.ts';
import { formatTrace } from './trace.ts';

const MAX_KEPT = 5;
const traces: CaptureTrace[] = [];

export function rememberTrace(trace: CaptureTrace): void {
  traces.unshift(trace);
  if (traces.length > MAX_KEPT) traces.length = MAX_KEPT;
}

export function hasTraces(): boolean {
  return traces.length > 0;
}

/** Every kept trace, newest first, as one pasteable block. */
export function formatRememberedTraces(): string {
  if (traces.length === 0) return 'no traces yet';
  return traces.map(formatTrace).join('\n\n----------------\n\n');
}

export function clearTraces(): void {
  traces.length = 0;
}
