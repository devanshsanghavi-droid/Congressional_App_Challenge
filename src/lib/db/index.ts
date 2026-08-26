/**
 * Database access.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * `expo-sqlite`, opened once and migrated on first use. Every function that
 * touches notice data is here, so the no-network test has one place to watch.
 */

import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME, MIGRATIONS } from './schema.ts';

let database: SQLite.SQLiteDatabase | undefined;

/**
 * Run every migration above the stored `user_version`.
 *
 * `user_version` rather than a table of our own: it is a SQLite built-in, it is
 * transactional with the statements that bump it, and it cannot get out of step
 * with the file it describes.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    const statements = MIGRATIONS[version];
    if (!statements) continue;
    await db.withTransactionAsync(async () => {
      for (const statement of statements) await db.execAsync(statement);
      // PRAGMA does not accept a bound parameter, and `version` is a loop index
      // over a literal array, never user input.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/**
 * The in-flight open, memoised.
 *
 * **The promise, not the resolved handle.** Caching only the handle guards
 * nothing until the first open has finished: two callers that arrive while it
 * is still running both see `undefined`, both open the database, and both run
 * `migrate()`. `CREATE TABLE IF NOT EXISTS` survives that. Migration v2's
 * `ALTER TABLE notices DROP COLUMN recipient_name` does not — the second run
 * throws "no such column", the whole open rejects, and the screen that asked
 * renders its error state.
 *
 * That bug was latent from v2 until 2026-08-24, when the onboarding gate began
 * reading a setting from the root layout at the same moment Home reads the
 * notice list. Nothing had ever opened the database twice at once before, so a
 * race that was always there had never been run. Found on a fresh install,
 * where it presents as "Carta could not open your notices" on first launch —
 * the worst possible first impression and invisible on every later launch,
 * because by then the migrations are done and the second run is a no-op.
 */
let opening: Promise<SQLite.SQLiteDatabase> | undefined;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  // Every concurrent caller awaits the SAME open. One migration run, always.
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    // Foreign keys are OFF by default in SQLite and must be set per connection.
    // Without this, deleting a notice orphans its reminders instead of cascading.
    await db.execAsync('PRAGMA foreign_keys = ON');
    await migrate(db);
    database = db;
    return db;
  })();

  try {
    return await opening;
  } catch (error) {
    // A failed open must not be cached, or the app is broken until it is force
    // quit. Clearing it lets the next caller — or a "Try again" tap — retry.
    opening = undefined;
    throw error;
  }
}

/**
 * Drop every row in every table. Backs "Delete everything" in Settings (SPEC §7)
 * together with `destroyKeys()`, which is the half that makes it irreversible.
 *
 * **Every table is named explicitly, and that is the point.** This function
 * used to delete `reminders` and `notices` only, on the reasonable-sounding
 * assumption that foreign keys would carry the rest. They do not:
 *
 *   - `requirements` really does cascade from `notices`, so it was fine.
 *   - **`documents` is deliberately standalone** — schema.ts explains why: a pay
 *     stub outlives the notice it was attached to, which is what makes the Vault
 *     possible. Nothing cascades to it, so a user who tapped "Delete everything"
 *     kept every photographed document they owned.
 *   - **`settings` has no parent either**, so the wipe left the language, the
 *     reminder hour and `onboardingDone` behind — meaning the app did not even
 *     return to a first-launch state.
 *
 * A wipe that quietly keeps the most sensitive images on the device is worse
 * than no wipe, because the user has been told it is gone. So: no reliance on
 * cascade, and a test asserts this list matches the tables `schema.ts` creates.
 */
export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const table of WIPED_TABLES) {
      await db.execAsync(`DELETE FROM ${table}`);
    }
  });
}

/**
 * Every table `schema.ts` creates. Exported so `tests/app/wipe.test.ts` can
 * compare it against the schema and fail when a migration adds a sixth table
 * that nobody remembered to wipe.
 *
 * Order matters only while foreign keys are on: children before parents.
 */
export const WIPED_TABLES = [
  'requirements',
  'reminders',
  'documents',
  'notices',
  'settings',
] as const;

/** Testing seam: forget the open handle so the next call re-opens and migrates. */
export function resetConnectionForTests(): void {
  database = undefined;
  opening = undefined;
}
