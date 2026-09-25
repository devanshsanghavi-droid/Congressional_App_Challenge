/**
 * A camera view that reads QR codes, for the phone-to-phone hand-off.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * `expo-camera` was replaced for photographing letters because it cannot
 * tap-to-focus on a page (see capture.tsx). A QR code on another phone's screen
 * is a different job: high contrast, held at arm's length, read by iOS's own
 * barcode detector. Nothing is photographed or saved; the camera reports the
 * text inside each code and that is all this component passes on.
 *
 * Asks for the camera only when shown, with the reason on screen, and says what
 * to do if it was refused.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Body, Button } from '@/components/ui';
import { color, radius } from '@/lib/theme/tokens';

export function QrScanner({ onCode, height = 320 }: { onCode: (text: string) => void; height?: number }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.ask}>
        <Body>{t('handoff.cameraNeeded')}</Body>
        <Button
          title={t('handoff.allowCamera')}
          variant="secondary"
          onPress={() => {
            // Once refused, iOS will not ask again; its own Settings is the only way back.
            if (permission.canAskAgain) void requestPermission();
            else void Linking.openSettings();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onCode(data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.text },
  ask: { gap: 8 },
});
