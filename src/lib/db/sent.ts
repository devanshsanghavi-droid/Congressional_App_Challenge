/**
 * Dated copies of filled-in forms, kept from the moment before they were mailed.
 *
 * AUTHORSHIP: Claude. App-side data access (CLAUDE.md §7).
 *
 * KFF's unwinding survey found 24% of people who tried to renew were told their
 * forms were not received or not processed. A dated photo of exactly what went in
 * the envelope does not make the county find it, but it makes sending it again a
 * minute's work instead of a week's, and it is something to point at on the phone.
 */

import { getDatabase } from './index.ts';
import type { SentCopyRow } from './schema.ts';

/** The doc type a mailed copy is stored under (content/doc_types.json), so the Vault groups them. */
export const SENT_FORM_DOC_TYPE = 'sent_form';

export interface SentCopy {
  readonly id: string;
  readonly noticeId: string;
  readonly documentId: string;
  readonly sentAt: number;
}

export async function saveSentCopy(noticeId: string, documentId: string, sentAt: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO sent_copies (id, notice_id, document_id, sent_at) VALUES (?, ?, ?, ?)',
    `s_${documentId}`,
    noticeId,
    documentId,
    sentAt,
  );
}

export async function listSentCopies(noticeId: string): Promise<SentCopy[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SentCopyRow>(
    'SELECT * FROM sent_copies WHERE notice_id = ? ORDER BY sent_at DESC',
    noticeId,
  );
  return rows.map((r) => ({ id: r.id, noticeId: r.notice_id, documentId: r.document_id, sentAt: r.sent_at }));
}
