/**
 * The OCR adapter — the one place the app talks to a text recogniser.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * Two jobs, and they are both about making the phone and the corpus harness
 * agree:
 *
 *   1. **Normalise the geometry.** `expo-mlkit-ocr` returns boxes in image
 *      pixels; the extraction cascade and the metrics harness both work in
 *      0–1 top-left coordinates. Converting here means the cascade never has
 *      to know which it is being fed.
 *
 *   2. **Downscale before recognising.** Full-resolution capture is wasted
 *      compute on a phone, and the corpus was measured at 1700px wide — so a
 *      photo that reaches the recogniser at 4032px is not the thing the metrics
 *      table describes. Same width, same numbers.
 *
 * A note on the engine, because the package name is misleading. On iOS,
 * `expo-mlkit-ocr` at its default `iosEngine: "auto"` installs no ML Kit pod
 * and compiles Apple Vision instead — confirmed in `ios/Podfile.lock`, the
 * podspec, the config plugin and the module source (CLAUDE.md §13). Android is
 * genuinely ML Kit. Both are on-device; neither touches the network.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { isSupported, recognizeText } from 'expo-mlkit-ocr';

import type { OcrLine, OcrResult } from './types.ts';

/**
 * Width the recogniser sees. Matches the corpus, so the accuracy figures in the
 * README describe what the app actually does rather than something adjacent to
 * it.
 */
export const OCR_INPUT_WIDTH = 1700;

/**
 * Resize and EXIF-rotate, and nothing else.
 *
 * `expo-image-manipulator` cannot grayscale, threshold or deskew — its whole
 * action set is resize / rotate / flip / crop / extent. That is fine:
 * aggressive binarisation is Tesseract-era advice and neural recognisers
 * generally do *worse* on hand-thresholded input (CLAUDE.md §5).
 */
export interface PreparedImage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  /** Dimensions before the resize, for the trace. */
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export async function prepareForOcr(uri: string): Promise<PreparedImage> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  // Render once before resizing to learn the true post-EXIF dimensions. On a
  // phone the camera writes a landscape buffer plus an orientation tag, and
  // whether the manipulator has applied it is exactly the thing that has never
  // been observed — if `sourceWidth > sourceHeight` on a portrait photo, it has
  // not, and every bounding box downstream is on its side.
  const original = await context.renderAsync();
  const sourceWidth = original.width;
  const sourceHeight = original.height;

  context.resize({ width: OCR_INPUT_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.92, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height, sourceWidth, sourceHeight };
}

/**
 * Recognise text in an image already on disk in the app sandbox.
 *
 * Never writes to the camera roll and never leaves the device — see
 * `tests/app/no-network.test.ts`.
 */
export async function recognize(uri: string): Promise<OcrResult & { prepared: PreparedImage }> {
  const prepared = await prepareForOcr(uri);
  const result = await recognizeText(prepared.uri);

  const { width, height } = prepared;
  const lines: OcrLine[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      const box = line.boundingBox;
      lines.push({
        text: line.text,
        // Neither engine reports a per-line confidence through this module, so
        // there is nothing honest to put here but 1. The extraction cascade's
        // confidence model is its own and does not depend on this number.
        confidence: 1,
        box: {
          x: box.x / width,
          y: box.y / height,
          w: box.width / width,
          h: box.height / height,
        },
      });
    }
  }

  return {
    lines,
    text: lines.map((line) => line.text).join('\n'),
    width,
    height,
    engine: Platform.OS === 'ios' ? 'apple-vision' : 'mlkit',
    prepared,
  };
}

export function isOcrSupported(): boolean {
  return isSupported();
}
