/**
 * Web stub: the native iOS time wheel.
 *
 * Renders a real `<input type="time">` so the reminder hour is still settable
 * and Settings keeps its true height. It deliberately does NOT reproduce the
 * wheel: the device time format is the OS's job, and pretending otherwise here
 * is how a preview starts lying about the app.
 */
import { Platform, View } from 'react-native';

interface Props {
  value: Date;
  onChange?: (event: { type: string }, date?: Date) => void;
}

export default function DateTimePicker({ value, onChange }: Props) {
  const hh = String(value.getHours()).padStart(2, '0');
  const mm = String(value.getMinutes()).padStart(2, '0');

  if (Platform.OS !== 'web') return null;

  return (
    <View style={{ paddingVertical: 8 }}>
      {/* react-native-web passes unknown tags straight through to the DOM. */}
      <input
        type="time"
        value={`${hh}:${mm}`}
        style={{ font: 'inherit', fontSize: 17, padding: 8 }}
        onChange={(event: { target: { value: string } }) => {
          const [h, m] = event.target.value.split(':').map(Number);
          const next = new Date(value);
          next.setHours(h ?? 0, m ?? 0, 0, 0);
          onChange?.({ type: 'set' }, next);
        }}
      />
    </View>
  );
}
