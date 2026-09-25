/**
 * A QR code, drawn on the phone with no network and no native module.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * `qrcode-generator` (MIT, pure JavaScript) encodes the text and returns a GIF
 * as a data URI, so one frame is one native image view. Drawing the modules as
 * React Native views was the alternative: about a thousand views for a 65 by 65
 * code, re-rendered every 300 ms while the hand-off loops, which is the kind of
 * work that makes a scanner miss frames.
 *
 * White background and a four-module quiet zone, as the QR specification asks.
 * A dark-mode page behind it would otherwise make the border part of the code.
 */

import makeQr from 'qrcode-generator';
import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

/** Pixels per module in the generated image; the view scales it to fit. */
const CELL = 5;
const QUIET_MODULES = 4;

/** Encode once per distinct value; the hand-off shows the same frames on a loop. */
const cache = new Map<string, string>();

export function qrDataUri(value: string): string {
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  const qr = makeQr(0, 'L');
  qr.addData(value, 'Byte');
  qr.make();
  const uri = qr.createDataURL(CELL, CELL * QUIET_MODULES);
  if (cache.size > 300) cache.clear();
  cache.set(value, uri);
  return uri;
}

export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const uri = useMemo(() => qrDataUri(value), [value]);
  return (
    <View style={[styles.frame, { width: size, height: size }]} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#FFFFFF', alignSelf: 'center' },
});
