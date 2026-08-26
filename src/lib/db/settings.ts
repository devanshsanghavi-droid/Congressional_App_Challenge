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
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

const DEFAULTS: Readonly<Record<SettingKey, boolean>> = {
  deleteSourceImage: true,
  onboardingDone: false,
};

export async function getBooleanSetting(key: SettingKey): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  if (!row) return DEFAULTS[key];
  return row.value === 'true';
}

export async function setBooleanSetting(key: SettingKey, value: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value ? 'true' : 'false',
  );
}
