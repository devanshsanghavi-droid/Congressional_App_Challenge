/**
 * User settings, in the database.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * A table rather than constants because these are the user's decisions, and a
 * privacy default that cannot be changed is a policy, not a setting.
 */

import { getDatabase } from './index.ts';

export const SETTINGS = {
  /**
   * Delete the source photograph once the text has been extracted and confirmed.
   *
   * **Default on** (SPEC §5). The photograph's job ends when the text is out of
   * it: the deadline, the case number and the checklist all live in the
   * database from that point, and the image is the single richest thing on the
   * device — the name, the home address and the case number, rendered legibly.
   *
   * Off keeps an encrypted copy for "view original", which some people will
   * want. It is never kept in plaintext either way.
   */
  deleteSourceImage: 'deleteSourceImage',

  /**
   * Has the user been through onboarding.
   *
   * **Defaults to false**, so a fresh install sees it once and every later
   * launch does not. Stored rather than derived from "are there notices yet",
   * because someone who skipped onboarding and then deleted their only notice
   * should not be shown it again — they already made that choice.
   */
  onboardingDone: 'onboardingDone',

  /**
   * The interface language, when the user has chosen one.
   *
   * **Absent by default, and that is different from 'en'.** Absent means "follow
   * the phone", so a Spanish-speaking household that has never opened Settings
   * gets Spanish from `resolveInitialLanguage()`. Writing 'en' on first launch
   * would silently pin every user to English the moment they opened the screen.
   */
  language: 'language',

  /**
   * Hour of the day reminders fire, local, as a decimal string.
   *
   * Stored rather than assumed because a reminder at the wrong hour for someone
   * working a double shift is a reminder that is never seen, and that is the
   * only failure this product cannot afford.
   */
  reminderHour: 'reminderHour',
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

/**
 * The subset of settings that are booleans.
 *
 * Split from `SettingKey` so `getBooleanSetting(SETTINGS.language)` is a
 * compile error rather than a value that reads `'es' === 'true'` and returns
 * false. The boolean API predates the string one and is the easier of the two
 * to reach for by habit.
 */
export type BooleanSettingKey = typeof SETTINGS.deleteSourceImage | typeof SETTINGS.onboardingDone;

const DEFAULTS: Readonly<Record<BooleanSettingKey, boolean>> = {
  deleteSourceImage: true,
  onboardingDone: false,
};

export async function getBooleanSetting(key: BooleanSettingKey): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  if (!row) return DEFAULTS[key];
  return row.value === 'true';
}

export async function setBooleanSetting(key: BooleanSettingKey, value: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value ? 'true' : 'false',
  );
}

/**
 * Read a setting that is not a boolean.
 *
 * Returns `undefined` when the user has never set it, which callers must treat
 * as "no decision made" rather than substituting a default of their own — see
 * `SETTINGS.language` for why the distinction matters.
 */
export async function getStringSetting(key: SettingKey): Promise<string | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value;
}

export async function setStringSetting(key: SettingKey, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}
