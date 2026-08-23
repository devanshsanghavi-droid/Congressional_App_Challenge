/**
 * The one capture in flight, between Capture and Review.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Zustand rather than route params: the OCR result carries a few hundred
 * bounding boxes, and expo-router serialises params into the URL. Passing it
 * through navigation would both bloat the route and stringify the numbers.
 *
 * Deliberately **not** persisted. Nothing here has been confirmed by the user
 * yet, so nothing here may be written to disk (CLAUDE.md §4 rule 6). It lives
 * for the length of one review and is dropped on save or cancel.
 */

import { create } from 'zustand';

import type { CaptureTrace } from '../diagnostics/trace.ts';
import type { ExtractionResult } from '../extraction-port/port.ts';
import type { OcrResult } from '../ocr/types.ts';

export interface PendingCapture {
  readonly photoUri: string;
  readonly ocr: OcrResult;
  readonly extraction: ExtractionResult;
  /**
   * Carried through to Review so the trace can be copied *after* a save fails
   * too — the stages that matter most (save, encrypt-image, schedule) all
   * happen on that screen, not this one.
   */
  readonly trace: CaptureTrace;
}

interface CaptureStore {
  // `| undefined` rather than `?`: under exactOptionalPropertyTypes, clearing
  // the slot means writing undefined into it, which an optional property
  // forbids.
  pending: PendingCapture | undefined;
  setPending: (capture: PendingCapture) => void;
  clear: () => void;
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  pending: undefined,
  setPending: (capture) => set({ pending: capture }),
  clear: () => set({ pending: undefined }),
}));
