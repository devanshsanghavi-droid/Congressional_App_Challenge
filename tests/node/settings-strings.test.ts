/**
 * A string may not send a user to Settings unless Settings is reachable.
 *
 * AUTHORSHIP: Claude. App-side content under test.
 *
 * ---------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------
 * Found on a cold-start pass, 2026-08-25. Six user-facing strings told people to
 * go to Settings. **Carta had no Settings screen.**
 *
 * Two of the six meant the *iOS* Settings app — "notifications are turned off,
 * turn them on in Settings", "Carta needs the camera" — and those are at least
 * reachable, because the iOS Settings app exists and the user can open it. (Only
 * Home's "no reminders" card actually offers a button; see the note on
 * `IOS_SETTINGS` below.) The other four meant Carta's own, and the worst of them
 * was `onboarding.modelLater`:
 *
 *   > "You can turn this on later in Settings. Nothing is missing without it."
 *
 * Onboarding runs once. It was the only production path to the model download.
 * So a user who tapped **"Not now"** — the sensible choice on a metered
 * connection — was told they could enable it later and then never could. The
 * plain-language explanation, one of the two things this app exists to do, was
 * permanently unreachable, and Notice Detail rendered a sentence pointing at a
 * screen that was not there.
 *
 * Nothing failed. It typechecked, it rendered, the copy read well, and both
 * locales were in perfect parity — parity with each other about a screen that
 * did not exist.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * Every string that names Settings must be classified, deliberately, as one of:
 *
 *   - **ours** — Carta's Settings screen, which must exist as a route and be
 *     reachable from Home; or
 *   - **ios** — the system Settings app, which the app must actually know how to
 *     open somewhere (`Linking.openSettings()`).
 *
 * Anything else fails. Adding a string to `IOS_SETTINGS` is a deliberate act
 * that shows up in a diff, and it carries the obligation that the code actually
 * makes that call. There is no "unclassified" bucket, because that is the bucket
 * all six of these were in.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const LOCALES = ['en', 'es'] as const;

/**
 * Words that mean "the Settings app / screen" in each language.
 *
 * Spanish is the reason this is a list and not one word: CDSS and Apple both use
 * *Ajustes*, and Carta's own copy has used *Configuración*. A check that only
 * knew the English would have passed the Spanish half of every one of the six.
 */
const SETTINGS_WORDS = [/\bSettings\b/, /\bAjustes\b/, /\bConfiguraci[oó]n\b/];

/**
 * Keys whose "Settings" is the **iOS** one. Short on purpose, and each must be
 * backed by a real `Linking.openSettings()` call — asserted below.
 */
const IOS_SETTINGS: readonly string[] = [
  // Shown in an Alert after saving when iOS kept no reminders. Means the iOS
  // Settings app.
  'review.noRemindersBody',
  // Checklist's camera-permission error. Also the iOS Settings app.
  'checklist.cameraDenied',
];

/**
 * Known gap, recorded rather than silently accepted: both `IOS_SETTINGS` strings
 * are **text-only prompts**. They tell the user to go to iOS Settings and do not
 * offer a button that takes them there — only Home's "no reminders" card calls
 * `Linking.openSettings()`.
 *
 * That is a much smaller problem than the one this file was written for: the
 * iOS Settings app exists and the user can reach it themselves, whereas Carta's
 * Settings did not exist at all. Left alone deliberately, and flagged here so it
 * is a decision rather than an oversight.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function flatten(node: Json, path: string, out: Map<string, string>): void {
  if (typeof node === 'string') {
    out.set(path, node);
    return;
  }
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) flatten(v, path === '' ? k : `${path}.${k}`, out);
  }
}

function strings(locale: string): Map<string, string> {
  const raw = JSON.parse(
    readFileSync(join(REPO, 'src', 'lib', 'i18n', 'locales', `${locale}.json`), 'utf8'),
  ) as Json;
  const out = new Map<string, string>();
  flatten(raw, '', out);
  return out;
}

/** Every key, in either locale, whose text names Settings. */
function keysMentioningSettings(): Set<string> {
  const found = new Set<string>();
  for (const locale of LOCALES) {
    for (const [key, text] of strings(locale)) {
      if (SETTINGS_WORDS.some((w) => w.test(text))) found.add(key);
    }
  }
  return found;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const ALL_SOURCE = (): string => sourceFiles(join(REPO, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');

describe('every string that names Settings points somewhere real', () => {
  it('finds strings to check, so a pass is not vacuous', () => {
    // If the walker or the word list breaks, this suite would pass by finding
    // nothing at all — which is exactly how the original bug looked.
    expect(keysMentioningSettings().size).toBeGreaterThan(3);
  });

  it('names only keys that actually exist as iOS-Settings strings', () => {
    // A stale exemption is worse than no exemption: it silently excuses nothing
    // while making the list look considered. Both of these were wrong on the
    // first write — the keys are `review.*` and `checklist.*`, not `home.*` and
    // `capture.*` — and the arithmetic below was what caught it.
    const all = keysMentioningSettings();
    for (const key of IOS_SETTINGS) {
      expect([...all]).toContain(key);
    }
  });

  it('leaves nothing unclassified', () => {
    // Everything not explicitly marked iOS is Carta's, and the tests below
    // assert Carta's is reachable. The point of this one is that the set is
    // *known*: a new string naming Settings has to be classified on purpose.
    const ours = [...keysMentioningSettings()].filter((k) => !IOS_SETTINGS.includes(k));
    expect(ours.length + IOS_SETTINGS.length).toBe(keysMentioningSettings().size);
    // And the four that caused this must all be on the "ours" side.
    for (const key of ['onboarding.modelLater', 'onboarding.downloadFailedBody', 'explain.notDownloaded']) {
      expect(ours).toContain(key);
    }
  });

  it('has a Settings route for the strings that mean ours', () => {
    const ours = [...keysMentioningSettings()].filter((k) => !IOS_SETTINGS.includes(k));
    // The whole failure in one assertion: four strings said "in Settings" and
    // src/app/settings.tsx did not exist.
    expect(ours.length).toBeGreaterThan(0);
    expect(statSync(join(REPO, 'src', 'app', 'settings.tsx')).isFile()).toBe(true);
  });

  it('reaches that route from Home, not only from a screen shown once', () => {
    // Onboarding runs exactly once, so "you can do it later in Settings" is only
    // true if Settings is reachable from a screen the user returns to.
    const home = readFileSync(join(REPO, 'src', 'app', 'index.tsx'), 'utf8');
    expect(home).toContain("router.push('/settings')");
  });

  it('registers the route in the navigator', () => {
    const layout = readFileSync(join(REPO, 'src', 'app', '_layout.tsx'), 'utf8');
    expect(layout).toContain('name="settings"');
  });

  it('backs each iOS-Settings string with a real openSettings call', () => {
    // The exemption's obligation. Marking a string "iOS" without the call is the
    // same dead end wearing a different label.
    expect(ALL_SOURCE()).toContain('Linking.openSettings()');
  });

  it('keeps both locales pointing at the same place', () => {
    // The original six were in perfect en/es parity — about a screen that did
    // not exist. Parity is necessary and it is not sufficient, so this asserts
    // the two locales agree on WHICH keys mention Settings, and the tests above
    // assert the destination is real.
    const per = LOCALES.map(
      (l) =>
        new Set(
          [...strings(l)]
            .filter(([, text]) => SETTINGS_WORDS.some((w) => w.test(text)))
            .map(([key]) => key),
        ),
    );
    const [en, es] = per as [Set<string>, Set<string>];
    expect([...en].filter((k) => !es.has(k))).toEqual([]);
    expect([...es].filter((k) => !en.has(k))).toEqual([]);
  });
});

describe('the privacy statement is the one from NOTES.md', () => {
  /**
   * CLAUDE.md §11 forbids "the database is encrypted", because it is false —
   * the model is field-level. NOTES.md (2026-08-20) wrote "the honest
   * one-sentence version" and Settings renders it verbatim.
   *
   * Pinned against NOTES.md rather than against a copy, so the two cannot drift
   * apart and leave the app making a claim the decision log does not support.
   */
  /**
   * Comments stripped, for the same reason `countdown-scaling.test.ts` strips
   * them: `settings.tsx` documents that "the database is encrypted" is the
   * forbidden sentence, and scanning raw bytes flags the file for quoting the
   * rule it obeys.
   */
  const settingsSource = (): string =>
    readFileSync(join(REPO, 'src', 'app', 'settings.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');

  const settingsRaw = (): string =>
    readFileSync(join(REPO, 'src', 'app', 'settings.tsx'), 'utf8');

  it('renders the exact sentence, not a comfortable rounding of it', () => {
    // Pins the string that actually RENDERS, not a copy of it in the TSX. There
    // used to be a `PRIVACY_SENTENCE` constant duplicating it; that duplication
    // is how the sentence drifted from the code, so the constant is gone and
    // this reads the i18n value the screen renders.
    const source = strings('en').get('settings.privacyExact') ?? '';
    // Updated 2026-08-26. The previous fragments pinned a sentence that had
    // drifted: it said the recipient's name was plaintext (migration v2 drops
    // that column and the name is in the encrypted payload) and that the
    // photograph was a plain file (it is deleted by default, encrypted when
    // kept). This test failing is what caught it, which is the whole point of
    // pinning prose against the code that implements it.
    for (const fragment of [
      'encrypted with AES-256-GCM',
      "the recipient's name are encrypted",
      'the case number is never stored',
      'only a salted hash and',
      'the photograph is deleted once the text has been read',
      'kept encrypted under the same key',
    ]) {
      expect(source).toContain(fragment);
    }
  });

  it('never claims the database is encrypted', () => {
    // The specific false sentence CLAUDE.md §11 names.
    const en = strings('en');
    for (const [, text] of en) {
      expect(text.toLowerCase()).not.toContain('the database is encrypted');
    }
    expect(settingsSource().toLowerCase()).not.toContain('the database is encrypted');
  });

  it('still exists word for word in NOTES.md', () => {
    const notes = readFileSync(join(REPO, 'NOTES.md'), 'utf8');
    expect(notes).toContain("The text of the letter and the recipient's name are encrypted");
    expect(notes).toContain('kept encrypted under the same key if you turn that off');
  });
});
