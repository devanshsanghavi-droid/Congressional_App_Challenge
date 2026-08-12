import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Imported for its side effect: this is what initialises i18next before any
// screen renders. Nothing in the app should read a user-facing string before
// this module has run.
import '@/lib/i18n';

/**
 * Root layout for every route in the app.
 *
 * expo-router builds the navigator from the file tree under src/app, so this
 * file is the one place to put anything that must wrap the entire app:
 * translations, safe-area insets, and later the persistent "not legal advice"
 * disclaimer required by SPEC §11.
 */
export default function RootLayout() {
  const { t } = useTranslation();

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTitleStyle: { fontSize: 20 },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: t('app.name') }} />
      </Stack>
    </SafeAreaProvider>
  );
}
