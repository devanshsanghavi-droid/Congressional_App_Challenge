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

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // Foreign keys are OFF by default in SQLite and must be set per connection.
  // Without this, deleting a notice orphans its reminders instead of cascading.
  await db.execAsync('PRAGMA foreign_keys = ON');
  await migrate(db);
  database = db;
  return db;
}

/**
 * Drop everything. Backs "Delete everything" in Settings (SPEC §7) together
 * with `destroyKeys()`, which is the half that makes it irreversible.
 */
export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM reminders');
    await db.execAsync('DELETE FROM notices');
  });
}

/** Testing seam: forget the open handle so the next call re-opens and migrates. */
export function resetConnectionForTests(): void {
  database = undefined;
}
