/**
 * First launch, with two callers racing — the regression test for the bug that
 * broke a brand-new install.
 *
 * AUTHORSHIP: Claude. App-side test.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS BUG WAS ACTUALLY FOUND, WHICH IS THE POINT
 * ---------------------------------------------------------------------------
 * **Not by a test.** Not by review, typecheck, lint, or 266 passing assertions.
 * It was found by wiping the Simulator, installing the app, and looking at the
 * screen — where Home said **"Carta could not open your notices"** before the
 * user had done anything at all.
 *
 * `getDatabase()` memoised the resolved handle:
 *
 *     if (database) return database;   // undefined until the FIRST open finishes
 *
 * which guards nothing while an open is in flight. Two callers arriving together
 * both saw `undefined`, both opened, and both ran `migrate()`.
 * `CREATE TABLE IF NOT EXISTS` survives that. Migration **v2**'s
 * `ALTER TABLE notices DROP COLUMN recipient_name` does not — the second run
 * throws *no such column*, the open rejects, and the screen renders its error.
 *
 * Three properties made it invisible to everything except a clean device:
 *
 *   1. **It only fires while migrations are pending**, i.e. on the very first
 *      launch after install. Afterwards the second run is a no-op forever.
 *   2. **Every development device has already launched the app.** Nobody who
 *      works on this would ever see it.
 *   3. **It needed two concurrent callers**, and there had never been any —
 *      screens mount one at a time. The onboarding gate reading a setting from
 *      the *root layout* while Home reads the notice list was the first
 *      genuinely simultaneous pair in the app's life. The bug was latent from
 *      schema v2 until the feature that exposed it shipped.
 *
 * So this file exists to make the untestable testable: it forces the race that
 * only a fresh install produces, and asserts on the thing that actually broke —
 * **migrations must run exactly once, no matter how many callers arrive at
 * once.**
 */

import { DATABASE_NAME, MIGRATIONS, SCHEMA_VERSION } from '../../src/lib/db/schema';

/**
 * A fake `expo-sqlite` that counts.
 *
 * Deliberately not a real database. What is under test is `getDatabase()`'s
 * concurrency, not SQLite — and using a real one would hide the failure, since
 * a second `openDatabaseAsync` on the same file succeeds. The counters here are
 * the assertion surface.
 */
interface FakeState {
  opens: number;
  /** Every statement executed, in order, across every connection. */
  statements: string[];
  /** `PRAGMA user_version`, shared across connections like a real file is. */
  userVersion: number;
  /** Set when a migration statement is run against an already-migrated file. */
  replayed: string[];
  /** Rows `reconcileWithOs` should see from its SELECT. */
  rows: { id: string; os_notification_id: string | null }[];
  /** Reminder ids the code marked cancelled. */
  cancelled: string[];
  /** Make the next open reject, for the retry test. */
  failNextOpen: boolean;
  /** Resolved by the test to release in-flight opens. */
  gate: Promise<void>;
  openGate: () => void;
}

const mockState: FakeState = {
  opens: 0,
  statements: [],
  userVersion: 0,
  replayed: [],
  rows: [],
  cancelled: [],
  failNextOpen: false,
  gate: Promise.resolve(),
  openGate: () => {},
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (): Promise<unknown> => {
    mockState.opens += 1;
    // Hold every caller here until the test releases them. This is what makes
    // the race deterministic rather than something that happens on unlucky
    // scheduling — without it the first open usually finishes before the second
    // starts, and the bug hides exactly as it did in production.
    await mockState.gate;
    if (mockState.failNextOpen) {
      mockState.failNextOpen = false;
      throw new Error('unable to open database file');
    }

    return {
      getFirstAsync: async (sql: string) => {
        if (sql.includes('user_version')) return { user_version: mockState.userVersion };
        return null;
      },
      execAsync: async (sql: string) => {
        mockState.statements.push(sql);
        const version = /PRAGMA user_version = (\d+)/.exec(sql);
        if (version) {
          mockState.userVersion = Number(version[1]);
          return;
        }
        // The real failure: v2's DROP COLUMN is not idempotent, so a second run
        // over an already-migrated file throws exactly as SQLite would.
        if (/DROP COLUMN/i.test(sql)) {
          if (mockState.replayed.includes(sql)) {
            throw new Error('no such column: recipient_name');
          }
          mockState.replayed.push(sql);
        }
      },
      withTransactionAsync: async (work: () => Promise<void>) => work(),
      runAsync: async (sql: string, ...args: unknown[]) => {
        const cancel = /UPDATE reminders SET state = 'cancelled' WHERE id = \?/.exec(sql);
        if (cancel) mockState.cancelled.push(String(args[0]));
        return {};
      },
      getAllAsync: async (sql: string) =>
        /FROM reminders/.test(sql) ? mockState.rows : [],
    };
  },
}));

// Imported after the mock so the module picks it up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDatabase, resetConnectionForTests } = require('../../src/lib/db/index') as
  typeof import('../../src/lib/db/index');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileWithOs } = require('../../src/lib/db/reminders') as
  typeof import('../../src/lib/db/reminders');

function freshDevice(): void {
  mockState.opens = 0;
  mockState.statements = [];
  mockState.userVersion = 0;
  mockState.replayed = [];
  mockState.rows = [];
  mockState.cancelled = [];
  mockState.failNextOpen = false;
  mockState.gate = new Promise<void>((resolve) => {
    mockState.openGate = resolve;
  });
  resetConnectionForTests();
}

/** How many times the whole migration set was replayed. */
function migrationRuns(): number {
  const first = MIGRATIONS[0]?.[0];
  if (first === undefined) throw new Error('no migrations to count');
  return mockState.statements.filter((s) => s === first).length;
}

describe('first launch, one caller', () => {
  beforeEach(freshDevice);

  it('opens once and migrates to the current version', async () => {
    mockState.openGate();
    await getDatabase();
    expect(mockState.opens).toBe(1);
    expect(migrationRuns()).toBe(1);
    expect(mockState.userVersion).toBe(SCHEMA_VERSION);
  });

  it('does not migrate again on a later launch', async () => {
    mockState.openGate();
    await getDatabase();
    resetConnectionForTests();
    await getDatabase();
    // Second open, but `user_version` is already current so nothing replays.
    expect(mockState.opens).toBe(2);
    expect(migrationRuns()).toBe(1);
  });
});

describe('first launch, callers racing', () => {
  beforeEach(freshDevice);

  /**
   * THE REGRESSION TEST. Two callers, both arriving before the first open has
   * finished — the root layout reading a setting while Home reads the notice
   * list, which is exactly what shipped.
   */
  it('opens the database exactly once when two callers race', async () => {
    const both = Promise.all([getDatabase(), getDatabase()]);
    mockState.openGate();
    await both;
    expect(mockState.opens).toBe(1);
  });

  it('runs the migrations exactly once when two callers race', async () => {
    const both = Promise.all([getDatabase(), getDatabase()]);
    mockState.openGate();
    await both;
    // The assertion that fails on the old code: the second run replays v2's
    // DROP COLUMN and throws "no such column: recipient_name".
    expect(migrationRuns()).toBe(1);
    expect(mockState.userVersion).toBe(SCHEMA_VERSION);
  });

  it('survives many simultaneous callers, as a growing app will have', async () => {
    const many = Promise.all(Array.from({ length: 12 }, () => getDatabase()));
    mockState.openGate();
    const handles = await many;
    expect(mockState.opens).toBe(1);
    expect(migrationRuns()).toBe(1);
    // Everyone gets the same connection, not twelve.
    for (const handle of handles) expect(handle).toBe(handles[0]);
  });

  it('does not reject any caller', async () => {
    // The user-visible symptom was Home's error mockState. Whichever caller lost
    // the race was the one that threw.
    const results = await (async () => {
      const settled = Promise.allSettled([getDatabase(), getDatabase(), getDatabase()]);
      mockState.openGate();
      return settled;
    })();
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });
});

describe('a failed open is not cached', () => {
  beforeEach(freshDevice);

  /**
   * The other half of the fix. Memoising the promise without clearing it on
   * failure would be worse than the bug: one transient failure at launch would
   * leave the app broken until it was force quit, and "Try again" would return
   * the same cached rejection forever.
   */
  it('lets a later caller retry after a failure', async () => {
    mockState.failNextOpen = true;
    mockState.openGate();

    await expect(getDatabase()).rejects.toThrow(/unable to open/);

    // The retry — what a "Try again" tap does — must actually try again.
    const db = await getDatabase();
    expect(db).toBeDefined();
    expect(mockState.opens).toBe(2);
    expect(mockState.userVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects every racing caller when the open fails, and still allows a retry', async () => {
    mockState.failNextOpen = true;
    const settled = Promise.allSettled([getDatabase(), getDatabase()]);
    mockState.openGate();
    const results = await settled;
    expect(results.every((r) => r.status === 'rejected')).toBe(true);

    await expect(getDatabase()).resolves.toBeDefined();
  });
});

/**
 * Reminders the OS did not keep must not be recorded as scheduled.
 *
 * Found on the same cold-start pass as the migration race, and it is the more
 * dangerous of the two: on a freshly erased device the database held four rows
 * marked `scheduled`, each with an OS notification id, and iOS held **zero**.
 * Home computes `remindersActive` from those rows, so it showed the notice as
 * covered while nothing would ever fire — a deadline tracker that has silently
 * stopped tracking, with no signal anywhere.
 */
describe('reconciling reminders against what the OS actually kept', () => {
  beforeEach(freshDevice);

  async function seed(): Promise<void> {
    mockState.openGate();
    const db = await getDatabase();
    for (const [i, tier] of ['t7', 't3', 't1', 'day_of'].entries()) {
      await db.runAsync(
        `INSERT INTO reminders (id, notice_id, fire_at, tier, urgent, os_notification_id, state)
         VALUES (?,?,?,?,?,?,?)`,
        `r_${i}`, 'n_1', 0, tier, 0, `os_${i}`, 'scheduled',
      );
    }
  }

  it('cancels every reminder the OS discarded', async () => {
    await seed();
    mockState.rows = [
      { id: 'r_0', os_notification_id: 'os_0' },
      { id: 'r_1', os_notification_id: 'os_1' },
      { id: 'r_2', os_notification_id: 'os_2' },
      { id: 'r_3', os_notification_id: 'os_3' },
    ];
    // iOS kept nothing — the exact cold-device state.
    const dropped = await reconcileWithOs('n_1', []);
    expect(dropped).toBe(4);
    expect(mockState.cancelled.sort()).toEqual(['r_0', 'r_1', 'r_2', 'r_3']);
  });

  it('keeps the ones the OS did accept', async () => {
    await seed();
    mockState.rows = [
      { id: 'r_0', os_notification_id: 'os_0' },
      { id: 'r_1', os_notification_id: 'os_1' },
    ];
    const dropped = await reconcileWithOs('n_1', ['os_0']);
    expect(dropped).toBe(1);
    expect(mockState.cancelled).toEqual(['r_1']);
  });

  it('does nothing when the OS kept everything', async () => {
    await seed();
    mockState.rows = [{ id: 'r_0', os_notification_id: 'os_0' }];
    const dropped = await reconcileWithOs('n_1', ['os_0', 'os_1']);
    expect(dropped).toBe(0);
    expect(mockState.cancelled).toEqual([]);
  });

  it('drops a reminder with no OS id at all', async () => {
    await seed();
    mockState.rows = [{ id: 'r_0', os_notification_id: null }];
    expect(await reconcileWithOs('n_1', ['os_0'])).toBe(1);
  });
});

describe('the schema itself', () => {
  it('has one migration per version, up to SCHEMA_VERSION', () => {
    // A mismatch here means `migrate()` silently stops short and the app runs
    // against a half-built database.
    expect(MIGRATIONS.length).toBe(SCHEMA_VERSION);
  });

  it('names the database', () => {
    expect(DATABASE_NAME).toBe('carta.db');
  });
});
