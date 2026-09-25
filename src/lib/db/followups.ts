/**
 * Second-chance dates the person asked to be reminded about.
 *
 * AUTHORSHIP: Claude. App-side data access (CLAUDE.md §7).
 *
 * The date is worked out from the notice by `timelines.ts`, and a person chose to
 * be reminded before it. This row remembers that choice, so a change of reminder
 * time can rebuild the reminder rather than silently dropping it.
 */

import { getDatabase } from './index.ts';
import type { FollowupRow } from './schema.ts';

export interface Followup {
  readonly noticeId: string;
  readonly ruleId: string;
  readonly targetDate: number;
}

const toFollowup = (row: FollowupRow): Followup => ({
  noticeId: row.notice_id,
  ruleId: row.rule_id,
  targetDate: row.target_date,
});

export async function saveFollowup(noticeId: string, ruleId: string, targetDate: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO followups (id, notice_id, rule_id, target_date, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (notice_id, rule_id) DO UPDATE SET target_date = excluded.target_date`,
    `f_${noticeId}_${ruleId}`,
    noticeId,
    ruleId,
    targetDate,
    Date.now(),
  );
}

export async function listFollowups(noticeId: string): Promise<Followup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FollowupRow>('SELECT * FROM followups WHERE notice_id = ?', noticeId);
  return rows.map(toFollowup);
}

export async function removeFollowup(noticeId: string, ruleId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM followups WHERE notice_id = ? AND rule_id = ?', noticeId, ruleId);
}

/** The reminder tier a follow-up is stored under in `reminders`. */
export const followupTier = (ruleId: string): string => `followup:${ruleId}`;
