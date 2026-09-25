import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Imported for its side effect: this is what initialises i18next before any
// screen renders. Nothing in the app should read a user-facing string before
// this module has run.
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { devSeed } from '@/lib/dev-seed';
import { SETTINGS, getBooleanSetting, getStringSetting } from '@/lib/db/settings';

/**
 * Root layout for every route in the app.
 *
 * expo-router builds the navigator from the file tree under src/app, so this
 * file is the one place to put anything that must wrap the entire app:
 * translations, safe-area insets, and later the persistent "not legal advice"
 * disclaimer required by SPEC §11.
 */
/**
 * Re-apply the language the user chose in Settings.
 *
 * i18next is initialised at module load from the **device** locale, because
 * nothing async can run before the first screen renders. A stored choice is
 * therefore applied a beat later, here.
 *
 * The setting is absent until the user picks one, and absent deliberately means
 * "follow the phone" rather than "English" — writing a default on first launch
 * would pin a Spanish-speaking household to English the first time they opened
 * this screen.
 */
function useSavedLanguage(): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await getStringSetting(SETTINGS.language);
        if (cancelled || saved === undefined) return;
        if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) return;
        if (i18n.language !== saved) await i18n.changeLanguage(saved);
      } catch {
        // The device language is a reasonable answer and already applied.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

/**
 * Send a first-time user to onboarding, once.
 *
 * Reads the flag rather than inferring from "are there notices yet": someone
 * who skipped onboarding and later deleted their only notice has already made
 * a choice, and showing it again would override it.
 *
 * A read failure sends nobody anywhere. Onboarding is the least important
 * screen in the app and must never be the reason it does not open.
 */
function useOnboardingGate(): void {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const done = await getBooleanSetting(SETTINGS.onboardingDone);
        if (!cancelled && !done) router.replace('/onboarding');
      } catch {
        // Straight to Home.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
}

/**
 * Open the right screen when a reminder is tapped.
 *
 * A deadline reminder carries its notice id and opens that notice; a "did it
 * come?" question carries the forecast's id and opens Home, where the question
 * is waiting. `useLastNotificationResponse` covers a tap that launched the app
 * as well as one that arrived while it was open. Each response is handled once:
 * the hook keeps returning the last one on every render.
 */
// Chosen once at load, so the hook order never changes between renders. The
// web build (dev/web-preview only) has no notification responses at all.
const useLastResponse: () => Notifications.NotificationResponse | null | undefined =
  typeof Notifications.useLastNotificationResponse === 'function'
    ? Notifications.useLastNotificationResponse
    : () => undefined;

function useNotificationTaps(): void {
  const router = useRouter();
  const response = useLastResponse();
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!response) return;
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = response.notification.request.content.data as Record<string, unknown> | null | undefined;
    const noticeId = data?.['noticeId'];
    if (typeof noticeId === 'string' && noticeId !== '') {
      router.push({ pathname: '/notice/[id]', params: { id: noticeId } });
      return;
    }
    if (typeof data?.['expectedId'] === 'string') router.navigate('/');
  }, [response, router]);
}

export default function RootLayout() {
  const { t } = useTranslation();
  useSavedLanguage();
  useNotificationTaps();
  // Web preview only — a no-op on iOS and Android, where `dev-seed.ts` wins.
  // Delete with dev/web-preview/ before the freeze.
  useEffect(() => {
    void devSeed();
  }, []);
  useOnboardingGate();

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
        <Stack.Screen name="checklist/[id]" options={{ title: t('checklist.title') }} />
        <Stack.Screen name="vault" options={{ title: t('vault.title') }} />
        <Stack.Screen name="where" options={{ title: t('where.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
        <Stack.Screen name="formcheck/[id]" options={{ title: t('formcheck.title') }} />
        <Stack.Screen name="handoff/send" options={{ title: t('handoff.sendTitle') }} />
        <Stack.Screen name="handoff/receive" options={{ title: t('handoff.receiveTitle') }} />
        {/* No header: onboarding provides its own Skip, and a back chevron into
            a half-finished onboarding is not a state worth having. */}
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
