import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import es from './locales/es.json';

/**
 * App-wide translation setup.
 *
 * Two things worth knowing about how this is configured:
 *
 * 1. Resources are imported statically and bundled into the app binary. There
 *    is no HTTP backend plugged into i18next, which matters because SPEC §0
 *    rule 1 forbids network access on any path that touches notice data, and
 *    the strings that describe a notice are exactly that path. The app is fully
 *    translated in airplane mode because the translations were never remote.
 *
 * 2. Scope is English and Spanish only, per SPEC §10. The architecture would
 *    take more languages — add a JSON file and a line in `resources` — but
 *    shipping two carefully beats five sloppily, and CDSS publishes official
 *    Spanish versions of these forms, so Spanish content can reuse the state's
 *    own approved wording rather than a from-scratch translation.
 */

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/**
 * Picks a starting language from the phone's settings. `getLocales()` returns
 * the user's preferences in priority order, so we take the first one we can
 * actually serve rather than just the top one — a phone set to French then
 * Spanish should get Spanish, not English.
 *
 * This is only the initial value. Settings will let the user override it
 * (SPEC §7), and changing it re-schedules every notification, because
 * notification bodies are localized at schedule time (SPEC §6).
 */
export function resolveInitialLanguage(): SupportedLanguage {
  for (const locale of getLocales()) {
    const code = locale.languageCode;
    if (code !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      return code as SupportedLanguage;
    }
  }
  return FALLBACK_LANGUAGE;
}

// i18next's default export legitimately has a `.use()` method; this is the
// documented setup call, not an accidental reference to the separate named
// export that happens to share the name.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  // React already escapes everything it renders; letting i18next escape too
  // would double-encode apostrophes, which Spanish copy is full of.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
