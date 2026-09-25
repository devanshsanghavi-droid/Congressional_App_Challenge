/**
 * Letters Carta expects a household to receive, so it can ask whether they came.
 *
 * AUTHORSHIP: Claude. App-side data access (CLAUDE.md §7).
 *
 * A forecast is created when a notice is confirmed (see `expected-letters.ts`)
 * and resolved one of three ways: a later scan matches it ("arrived"), the person
 * says it never came ("not_arrived", which shows what to do), or they say they get
 * their letters online ("online", which stops asking).
 */

import { getDatabase } from './index.ts';
import type { ExpectedLetterRow, ExpectedLetterState } from './schema.ts';

export interface ExpectedLetter {
  readonly id: string;
  readonly sourceNoticeId: string;
  readonly ruleId: string;
  readonly expectFrom: number;
  readonly expectBy: number;
  readonly askOn: number;
  readonly state: ExpectedLetterState;
  readonly matchedNoticeId?: string;
  readonly osNotificationId?: string;
}

const toExpected = (row: ExpectedLetterRow): ExpectedLetter => ({
  id: row.id,
  sourceNoticeId: row.source_notice_id,
  ruleId: row.rule_id,
  expectFrom: row.expect_from,
  expectBy: row.expect_by,
  askOn: row.ask_on,
  state: row.state as ExpectedLetterState,
  ...(row.matched_notice_id === null ? {} : { matchedNoticeId: row.matched_notice_id }),
  ...(row.os_notification_id === null ? {} : { osNotificationId: row.os_notification_id }),
});

/** Insert unless this notice already forecast this letter. Returns the id, new or existing. */
export async function saveForecast(input: {
  sourceNoticeId: string;
  ruleId: string;
  expectFrom: number;
  expectBy: number;
  askOn: number;
}): Promise<string> {
  const db = await getDatabase();
  const id = `e_${input.sourceNoticeId}_${input.ruleId}`;
  await db.runAsync(
    `INSERT OR IGNORE INTO expected_letters
       (id, source_notice_id, rule_id, expect_from, expect_by, ask_on, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'expected', ?)`,
    id,
    input.sourceNoticeId,
    input.ruleId,
    input.expectFrom,
    input.expectBy,
    input.askOn,
    Date.now(),
  );
  return id;
}

/** Still waiting: the ones Home shows. Soonest first. */
export async function listWaiting(): Promise<ExpectedLetter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpectedLetterRow>(
    `SELECT e.* FROM expected_letters e
       JOIN notices n ON n.id = e.source_notice_id
      WHERE e.state IN ('expected', 'not_arrived')
      ORDER BY e.ask_on ASC`,
  );
  return rows.map(toExpected);
}

export async function getExpected(id: string): Promise<ExpectedLetter | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExpectedLetterRow>('SELECT * FROM expected_letters WHERE id = ?', id);
  return row ? toExpected(row) : undefined;
}

export async function setExpectedState(id: string, state: ExpectedLetterState, matchedNoticeId?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE expected_letters SET state = ?, matched_notice_id = ?, os_notification_id = NULL WHERE id = ?',
    state,
    matchedNoticeId ?? null,
    id,
  );
}

export async function setAskOn(id: string, askOn: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE expected_letters SET ask_on = ?, state = 'expected' WHERE id = ?", askOn, id);
}

export async function setAskNotification(id: string, osNotificationId: string | undefined): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE expected_letters SET os_notification_id = ? WHERE id = ?', osNotificationId ?? null, id);
}

/** Every forecast a notice produced, for removing its notifications with it. */
export async function listForSource(sourceNoticeId: string): Promise<ExpectedLetter[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpectedLetterRow>(
    'SELECT * FROM expected_letters WHERE source_notice_id = ?',
    sourceNoticeId,
  );
  return rows.map(toExpected);
}
