/**
 * A photo's pixels, as a grayscale buffer the form check can measure.
 *
 * AUTHORSHIP: Claude. App-side (the one file in formcheck/ that touches the
 * device: the rest is pure and runs in Node).
 *
 * `expo-image-manipulator` resizes and re-encodes but never exposes pixels, so
 * the photo is downscaled to a JPEG in the app's cache, read back as bytes, and
 * decoded in JavaScript with `jpeg-js`. 1000 pixels across is enough to see a
 * pen mark in a box a sixth of an inch wide (about 20 pixels) and small enough
 * to decode in well under a second.
 *
 * Nothing leaves the phone and nothing is written outside the cache; the cached
 * copy is deleted before this returns.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import jpeg from 'jpeg-js';

import { toGray } from './ink.ts';
import type { GrayImage } from './ink.ts';

export const INK_WIDTH = 1000;

export async function grayPixels(uri: string): Promise<GrayImage> {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  context.resize({ width: INK_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
  const file = new File(saved.uri);
  try {
    const decoded = jpeg.decode(await file.bytes(), { useTArray: true, formatAsRGBA: true });
    return toGray(decoded.data, decoded.width, decoded.height);
  } finally {
    try {
      file.delete();
    } catch {
      // Cache; the OS clears it anyway.
    }
  }
}
