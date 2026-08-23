import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
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
/**
 * DEV ONLY — auto-run the acceptance test.
 *
 * `xcrun simctl openurl` raises an "Open in Carta?" confirmation that needs a
 * tap, and the Simulator's own UI cannot be driven without granting osascript
 * accessibility rights on this Mac. So the self-test is triggered by the
 * *presence of images to test* instead: stage JPEGs in Documents/selftest and
 * launch the app normally.
 *
 * Behind `__DEV__`, so it cannot exist in a release build, and removed with the
 * other dev screens before freeze.
 */
function useSelfTestAutoRun(): void {
  const router = useRouter();
  useEffect(() => {
    if (!__DEV__) return;
    const inbox = new Directory(Paths.document, 'selftest');
    if (!inbox.exists) return;
    const hasImages = inbox.list().some((entry) => /\.(jpe?g|heic|png)$/i.test(entry.name));
    if (hasImages) router.replace('/selftest');
  }, [router]);
}

/**
 * DEV ONLY — open a specific route at launch.
 *
 * The Simulator cannot be tapped from the command line, so reviewing a screen
 * that is two navigations deep means either shipping a shortcut or never
 * looking at it. Write a path into `Documents/dev-route.txt` and the app opens
 * there. Removed with the other dev affordances before freeze.
 */
function useDevRoute(): void {
  const router = useRouter();
  useEffect(() => {
    if (!__DEV__) return;
    const marker = new File(Paths.document, 'dev-route.txt');
    if (!marker.exists) return;
    const path = marker.textSync().trim();
    if (path.startsWith('/')) router.replace(path as Parameters<typeof router.replace>[0]);
  }, [router]);
}

export default function RootLayout() {
  const { t } = useTranslation();
  useSelfTestAutoRun();
  useDevRoute();

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
        <Stack.Screen name="capture" options={{ title: t('capture.title') }} />
        <Stack.Screen name="review" options={{ title: t('review.title') }} />
        <Stack.Screen name="notice/[id]" options={{ title: t('detail.title') }} />
        {/* Developer tools. Both deleted before freeze. */}
        <Stack.Screen name="bench" options={{ title: t('bench.title') }} />
        <Stack.Screen name="selftest" options={{ title: 'Self-test' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
