/**
 * Saving and reading notices.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * The rule this file enforces, and the reason it is not just a thin wrapper
 * over `INSERT`: **nothing gets written until the user has confirmed it and the
 * text has been through the redaction matcher.** CLAUDE.md §3 rule 5 and §4
 * rule 6. Both are checked here rather than trusted to the caller, because
 * "the screen calls them in the right order" is not a guarantee.
 */

import type { ExtractedNotice } from '../extraction-port/port.ts';
import type { ActionType, NoticeDates } from '../urgency.ts';
import { isoToLocalMs } from '../dates.ts';
import { encryptField, decryptField, hashCaseNumber } from './crypto.ts';
import { getDatabase } from './index.ts';
import type { NoticeRow, NoticeStatus } from './schema.ts';

// Re-exported so callers that already talk to this module do not need a second
// import; the implementation is pure and lives in src/lib/dates.ts.
export { isoToLocalMs, localMsToIso } from '../dates.ts';

const ACTION_TYPES: readonly string[] = [
  'approval', 'denial', 'reduction', 'discontinuance', 'info_request', 'recert_due',
];

export interface Notice {
  readonly id: string;
  readonly capturedAt: number;
  readonly actionType: ActionType;
  readonly programId?: string;
  readonly agency?: string;
  readonly formId?: string;
  readonly noticeDate?: number;
  readonly effectiveDate?: number;
  readonly deadlineDate?: number;
  readonly appealDeadline?: number;
  readonly aidPaidPendingDeadline?: number;
  readonly caseHash?: string;
  readonly caseLast4?: string;
  readonly containedSsn: boolean;
  readonly imageRef?: string;
  readonly status: NoticeStatus;
  readonly locale?: string;
  /**
   * False when the notice has a date to act on but nothing is scheduled with
   * the OS — almost always because notification permission was refused.
   *
   * Surfaced on the Home card rather than only as a toast at save time: a
   * deadline the app is silently not going to remind you about is the single
   * most dangerous state this product can be in, and a toast is gone in three
   * seconds.
   */
  readonly remindersActive: boolean;
}

/**
 * What goes inside the encrypted blob.
 *
 * `ocr_ref` holds an encrypted JSON envelope rather than bare text, because the
 * recipient's name has to live somewhere and it must not be a column.
 *
 * Re-deriving the name from the OCR text on demand — the obvious reading of
 * "read it out of the encrypted text" — would silently discard the user's
 * correction. The name is the field they are most likely to have fixed, since
 * it is the one that fails most (90.5% precision, and it fails plausibly:
 * "ANH TRAN" read as "ANN TRAN"). Re-running the extractor later would show
 * them "ANN TRAN" again, every time, after they had already corrected it.
 *
 * Putting it in the envelope gets the same privacy property — not a column, not
 * indexed, not queryable, unreadable without the key — while keeping what the
 * user typed.
 */
interface EncryptedPayload {
  readonly ocrText?: string;
  /** As confirmed by the user, not as extracted. */
  readonly recipientName?: string;
}

export interface SaveNoticeInput {
  /** The fields **as the user confirmed them**, not as extracted. */
  readonly fields: ExtractedNotice;
  /** Redacted OCR text. Requires `redacted` to be true. */
  readonly ocrText?: string;
  /** Whether the redaction matcher has run. Refuses to store text if false. */
  readonly redacted: boolean;
  readonly containedSsn?: boolean;
  readonly locale?: string;
  readonly nowMs?: number;
}

function value(fields: ExtractedNotice, key: keyof ExtractedNotice): string | undefined {
  const field = fields[key];
  return field?.value?.trim() === '' ? undefined : field?.value;
}

function dateValue(fields: ExtractedNotice, key: keyof ExtractedNotice): number | null {
  const raw = value(fields, key);
  if (raw === undefined) return null;
  return isoToLocalMs(raw) ?? null;
}

/**
 * Persist a confirmed notice. Returns its id.
 *
 * Throws rather than degrading if the caller passes OCR text that has not been
 * redacted. A silent skip would leave the app looking like it worked while the
 * one privacy guarantee it makes quietly did not hold.
 */
export async function saveNotice(input: SaveNoticeInput): Promise<string> {
  if (input.ocrText !== undefined && !input.redacted) {
    throw new Error(
      'refusing to store OCR text that has not been through the redaction matcher ' +
        '(CLAUDE.md §3 rule 5: never persist an SSN)',
    );
  }

  const action = value(input.fields, 'actionType');
  const actionType = action !== undefined && ACTION_TYPES.includes(action) ? action : 'recert_due';

  const caseNumber = value(input.fields, 'caseNumber');
  const caseRecord = caseNumber === undefined ? undefined : await hashCaseNumber(caseNumber);

  const recipientName = value(input.fields, 'recipientName');
  const payload: EncryptedPayload = {
    ...(input.ocrText === undefined ? {} : { ocrText: input.ocrText }),
    ...(recipientName === undefined ? {} : { recipientName }),
  };
  const ocrRef =
    Object.keys(payload).length === 0 ? null : await encryptField(JSON.stringify(payload));

  const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO notices (
       id, captured_at, program_id, agency, form_id, action_type,
       notice_date, effective_date, deadline_date, appeal_deadline,
       aid_paid_pending_deadline, case_hash, case_last4, extraction_source,
       contained_ssn, image_ref, ocr_ref, status, locale
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    input.nowMs ?? Date.now(),
    value(input.fields, 'programId') ?? null,
    value(input.fields, 'agency') ?? null,
    value(input.fields, 'formId') ?? null,
    actionType,
    dateValue(input.fields, 'noticeDate'),
    dateValue(input.fields, 'effectiveDate'),
    dateValue(input.fields, 'deadlineDate'),
    dateValue(input.fields, 'appealDeadline'),
    dateValue(input.fields, 'aidPaidPendingDeadline'),
    caseRecord?.hash ?? null,
    caseRecord?.last4 ?? null,
    // Every field is confirmed by the user before this runs, so the whole
    // record is user-corrected regardless of which layer proposed it.
    'llm_corrected',
    input.containedSsn === true ? 1 : 0,
    // Always null here. The image is encrypted after the row exists and
    // attached with setImageRef(), so there is no way to record a path to a
    // plaintext capture at save time.
    null,
    ocrRef,
    'active' satisfies NoticeStatus,
    input.locale ?? null,
  );

  return id;
}

type NoticeRowWithReminders = NoticeRow & { reminder_count: number };

function toNotice(row: NoticeRowWithReminders): Notice {
  const optional = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  return {
    id: row.id,
    capturedAt: row.captured_at,
    actionType: row.action_type as ActionType,
    ...(optional(row.program_id) === undefined ? {} : { programId: row.program_id as string }),
    ...(optional(row.agency) === undefined ? {} : { agency: row.agency as string }),
    ...(optional(row.form_id) === undefined ? {} : { formId: row.form_id as string }),
    ...(optional(row.notice_date) === undefined ? {} : { noticeDate: row.notice_date as number }),
    ...(optional(row.effective_date) === undefined ? {} : { effectiveDate: row.effective_date as number }),
    ...(optional(row.deadline_date) === undefined ? {} : { deadlineDate: row.deadline_date as number }),
    ...(optional(row.appeal_deadline) === undefined ? {} : { appealDeadline: row.appeal_deadline as number }),
    ...(optional(row.aid_paid_pending_deadline) === undefined
      ? {}
      : { aidPaidPendingDeadline: row.aid_paid_pending_deadline as number }),
    ...(optional(row.case_hash) === undefined ? {} : { caseHash: row.case_hash as string }),
    ...(optional(row.case_last4) === undefined ? {} : { caseLast4: row.case_last4 as string }),
    containedSsn: row.contained_ssn === 1,
    ...(optional(row.image_ref) === undefined ? {} : { imageRef: row.image_ref as string }),
    status: row.status as NoticeStatus,
    ...(optional(row.locale) === undefined ? {} : { locale: row.locale as string }),
    remindersActive: row.reminder_count > 0,
  };
}

/**
 * Counting scheduled reminders alongside the notice, so Home can flag a notice
 * that will never fire without a second query per card.
 */
const NOTICE_SELECT = `
  SELECT n.*,
         (SELECT COUNT(*) FROM reminders r
           WHERE r.notice_id = n.id AND r.state = 'scheduled') AS reminder_count
    FROM notices n`;

/**
 * Point a notice at its encrypted capture.
 *
 * Separate from `saveNotice` because encrypting a photograph takes long enough
 * to be worth doing after the row exists — the notice is safe on disk before
 * the slow part starts, and a failure to store the image cannot lose the
 * deadline.
 */
export async function setImageRef(id: string, imageRef: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE notices SET image_ref = ? WHERE id = ?', imageRef, id);
}

/** Active notices, nearest deadline first — the order Home renders in. */
/**
 * The date fields the countdown and the scheduler read, pulled off a stored
 * notice.
 *
 * Lifted out of Home and Notice Detail, which each had their own identical
 * copy. A third copy was about to appear for the reminder reschedule, and three
 * copies of the rule "which dates drive urgency" is how the countdown and the
 * scheduler end up disagreeing — the one disagreement `urgency.ts` exists to
 * make impossible.
 */
export function datesOf(notice: Notice): NoticeDates {
  return {
    actionType: notice.actionType,
    ...(notice.deadlineDate === undefined ? {} : { deadlineDate: notice.deadlineDate }),
    ...(notice.aidPaidPendingDeadline === undefined
      ? {}
      : { aidPaidPendingDeadline: notice.aidPaidPendingDeadline }),
  };
}

export async function listActiveNotices(): Promise<Notice[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoticeRowWithReminders>(
    `${NOTICE_SELECT} WHERE n.status = 'active'
     ORDER BY COALESCE(n.deadline_date, n.aid_paid_pending_deadline, 8640000000000000) ASC,
              n.captured_at DESC`,
  );
  return rows.map(toNotice);
}

export async function getNotice(id: string): Promise<Notice | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NoticeRowWithReminders>(
    `${NOTICE_SELECT} WHERE n.id = ?`,
    id,
  );
  return row ? toNotice(row) : undefined;
}

/**
 * Open the encrypted envelope. One decrypt, on a cold path — Review and Notice
 * Detail are single-record screens. Never called from Home.
 */
async function readPayload(id: string): Promise<EncryptedPayload | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ ocr_ref: string | null }>(
    'SELECT ocr_ref FROM notices WHERE id = ?',
    id,
  );
  if (!row?.ocr_ref) return undefined;
  return JSON.parse(await decryptField(row.ocr_ref)) as EncryptedPayload;
}

/** The original recognised text, decrypted on demand. */
export async function getNoticeText(id: string): Promise<string | undefined> {
  return (await readPayload(id))?.ocrText;
}

/**
 * The recipient's name, decrypted on demand.
 *
 * Deliberately not on the `Notice` returned by `listActiveNotices()`: Home must
 * not decrypt anything, and it does not need to — it shows the programme and
 * the countdown, and the user knows their own name.
 */
export async function getNoticeRecipientName(id: string): Promise<string | undefined> {
  return (await readPayload(id))?.recipientName;
}

/**
 * Earlier notices on the same case. This is the Maria Reyes chain: a SAR 7 that
 * was due, then the discontinuance caused by missing it. Matched on the salted
 * hash, so the case number itself is never compared or stored.
 */
export async function findRelatedNotices(caseHash: string, excludeId: string): Promise<Notice[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoticeRowWithReminders>(
    `${NOTICE_SELECT} WHERE n.case_hash = ? AND n.id != ? ORDER BY n.captured_at ASC`,
    caseHash,
    excludeId,
  );
  return rows.map(toNotice);
}
