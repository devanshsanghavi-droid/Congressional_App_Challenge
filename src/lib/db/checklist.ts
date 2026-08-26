/**
 * The Checklist's storage: requirements, and the documents attached to them.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHY TWO TABLES
 * ---------------------------------------------------------------------------
 * A *requirement* belongs to one notice: "this SAR 7 asks for a pay stub". A
 * *document* is a photograph that outlives it — the same pay stub is what the
 * next notice will ask for too. Collapsing them would either store the file
 * twice or lose which notice it was attached for, and it would make the Vault
 * (SPEC §7, below the line for now) impossible without another migration.
 *
 * ---------------------------------------------------------------------------
 * THE RULE THIS FILE EXISTS TO PROTECT
 * ---------------------------------------------------------------------------
 * CLAUDE.md §16: never invent a rule about what a programme requires. So every
 * requirement row records where it came from, and `origin` is never inferred:
 *
 *   'letter' — the extraction cascade read it off the notice. Carta may say
 *              "the letter asks for this".
 *   'user'   — the person added it. Carta says "you added this" and nothing
 *              stronger.
 *
 * `seedFromLetter` is the only writer of `'letter'`, it takes its list straight
 * from `ExtractionResult.requiredDocs`, and it refuses to run twice on the same
 * notice. There is deliberately no code path that promotes a user row to a
 * letter row.
 *
 * Documents are encrypted at rest with the same AES-256-GCM key as the notices,
 * through the same helpers in `./images.ts`. A photograph of a pay stub carries
 * a name, an employer and an income, and it is not less sensitive than the
 * notice that asked for it.
 */

import { getDatabase } from './index.ts';
import type { DocumentRow, RequirementRow } from './schema.ts';
import type {
  Requirement,
  RequirementOrigin,
  RequirementState,
  StoredDocument,
} from '../checklist.ts';

// Re-exported so callers import storage and rules from one place. The rules
// live in `../checklist.ts` because they are pure and belong in the bare-Node
// test project; nothing else about that split should leak into a screen.
export { progressOf } from '../checklist.ts';
export type {
  ChecklistProgress,
  Requirement,
  RequirementOrigin,
  RequirementState,
  StoredDocument,
} from '../checklist.ts';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ORIGINS: readonly string[] = ['letter', 'user'];
const STATES: readonly string[] = ['needed', 'attached', 'not_applicable'];

/**
 * Rows come back from SQLite as strings. A value outside the union would render
 * as an unlabelled row rather than throwing, so it is narrowed here and a bad
 * one is treated as the safest option: still needed, and added by the user.
 */
function toRequirement(row: RequirementRow, document?: StoredDocument): Requirement {
  const origin: RequirementOrigin = ORIGINS.includes(row.origin)
    ? (row.origin as RequirementOrigin)
    : 'user';
  const state: RequirementState = STATES.includes(row.state)
    ? (row.state as RequirementState)
    : 'needed';
  return {
    id: row.id,
    noticeId: row.notice_id,
    origin,
    state,
    position: row.position,
    ...(row.doc_type === null ? {} : { docType: row.doc_type }),
    ...(row.label === null ? {} : { label: row.label }),
    ...(document === undefined ? {} : { document }),
  };
}

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    imageRef: row.image_ref,
    ...(row.doc_type === null ? {} : { docType: row.doc_type }),
    ...(row.label === null ? {} : { label: row.label }),
  };
}

/**
 * Create the checklist for a notice from what the cascade read off the letter.
 *
 * Idempotent by design: it returns without writing if the notice already has
 * any requirement. Review runs on every save and the Checklist screen loads on
 * every visit, and seeding twice would silently double every row.
 */
export async function seedFromLetter(
  noticeId: string,
  docTypeIds: readonly string[],
): Promise<void> {
  if (docTypeIds.length === 0) return;
  const db = await getDatabase();

  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM requirements WHERE notice_id = ?',
    noticeId,
  );
  if ((existing?.count ?? 0) > 0) return;

  for (const [index, docType] of docTypeIds.entries()) {
    await db.runAsync(
      `INSERT INTO requirements (id, notice_id, doc_type, label, origin, state, document_id, position)
       VALUES (?, ?, ?, NULL, 'letter', 'needed', NULL, ?)`,
      newId('r'),
      noticeId,
      docType,
      index,
    );
  }
}

/** Every requirement on a notice, in display order, with any attached document. */
export async function listRequirements(noticeId: string): Promise<Requirement[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RequirementRow>(
    'SELECT * FROM requirements WHERE notice_id = ? ORDER BY position, rowid',
    noticeId,
  );

  const documentIds = rows.map((r) => r.document_id).filter((id): id is string => id !== null);
  const documents = new Map<string, StoredDocument>();
  if (documentIds.length > 0) {
    const placeholders = documentIds.map(() => '?').join(', ');
    const docRows = await db.getAllAsync<DocumentRow>(
      `SELECT * FROM documents WHERE id IN (${placeholders})`,
      ...documentIds,
    );
    for (const row of docRows) documents.set(row.id, toDocument(row));
  }

  return rows.map((row) =>
    toRequirement(row, row.document_id === null ? undefined : documents.get(row.document_id)),
  );
}

/**
 * Add a requirement the user typed or picked themselves.
 *
 * `origin` is hard-coded to `'user'` and is not a parameter. Making it one is
 * how a user-added row eventually gets presented as something the letter asked
 * for, which is the §16 failure this file is built to prevent.
 */
export async function addUserRequirement(
  noticeId: string,
  input: { docType?: string; label?: string },
): Promise<string> {
  const db = await getDatabase();
  const next = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(position) AS max FROM requirements WHERE notice_id = ?',
    noticeId,
  );
  const id = newId('r');
  await db.runAsync(
    `INSERT INTO requirements (id, notice_id, doc_type, label, origin, state, document_id, position)
     VALUES (?, ?, ?, ?, 'user', 'needed', NULL, ?)`,
    id,
    noticeId,
    input.docType ?? null,
    input.label ?? null,
    (next?.max ?? -1) + 1,
  );
  return id;
}

/** Store a captured document and attach it to a requirement in one step. */
export async function attachDocument(
  requirementId: string,
  document: { docType?: string; label?: string; imageRef: string },
): Promise<string> {
  const db = await getDatabase();
  const id = newId('d');
  await db.runAsync(
    `INSERT INTO documents (id, captured_at, doc_type, label, image_ref) VALUES (?, ?, ?, ?, ?)`,
    id,
    Date.now(),
    document.docType ?? null,
    document.label ?? null,
    document.imageRef,
  );
  await db.runAsync(
    `UPDATE requirements SET state = 'attached', document_id = ? WHERE id = ?`,
    id,
    requirementId,
  );
  return id;
}

/**
 * Point a document row at its encrypted file.
 *
 * Two steps rather than one for the same reason `saveNotice` + `setImageRef`
 * are: the file is named after the row id, so the row has to exist before the
 * file can be written. Between the two calls the row's `image_ref` is empty,
 * which is why `attachFromCamera` rolls the requirement back to `needed` if the
 * write fails rather than leaving a row pointing at nothing.
 */
export async function setDocumentImageRef(documentId: string, imageRef: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE documents SET image_ref = ? WHERE id = ?', imageRef, documentId);
}

/** Attach a document the user already has, from another notice. */
export async function attachExistingDocument(
  requirementId: string,
  documentId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE requirements SET state = 'attached', document_id = ? WHERE id = ?`,
    documentId,
    requirementId,
  );
}

/**
 * Every document already stored, newest first, for the "use one I already have"
 * picker. This is the Vault's data, read-only, before the Vault exists.
 */
export async function listDocuments(docType?: string): Promise<StoredDocument[]> {
  const db = await getDatabase();
  const rows =
    docType === undefined
      ? await db.getAllAsync<DocumentRow>('SELECT * FROM documents ORDER BY captured_at DESC')
      : await db.getAllAsync<DocumentRow>(
          'SELECT * FROM documents WHERE doc_type = ? ORDER BY captured_at DESC',
          docType,
        );
  return rows.map(toDocument);
}

/**
 * Move a requirement back to "still needed", detaching whatever was on it.
 *
 * The document itself is kept. Someone undoing an attachment is usually saying
 * "wrong document", not "delete that photograph", and the Vault will want it.
 */
export async function markNeeded(requirementId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE requirements SET state = 'needed', document_id = NULL WHERE id = ?`,
    requirementId,
  );
}

/**
 * "I do not have this / it does not apply to me."
 *
 * A first-class state, not a hidden one. A checklist that can only ever be
 * completed is a checklist that tells someone with no employer that they can
 * never be ready, and the honest answer is that a pay stub does not apply to
 * them. It counts as resolved for the progress figure and the UI says why.
 */
export async function markNotApplicable(requirementId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE requirements SET state = 'not_applicable', document_id = NULL WHERE id = ?`,
    requirementId,
  );
}

export async function removeRequirement(requirementId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM requirements WHERE id = ?', requirementId);
}

