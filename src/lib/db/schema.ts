/**
 * The database schema and its migrations.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * A subset of SPEC §6 — the tables the thin spine needs. `documents`,
 * `requirements` and `corrections` land with the Checklist and Vault in week 4;
 * leaving them out now keeps the migration honest rather than shipping empty
 * tables nothing writes to.
 *
 * Dates are epoch milliseconds computed in the device's local timezone
 * (CLAUDE.md §9). Not UTC: a deadline is a *day*, and the day it is depends on
 * where the user is standing.
 */

export const DATABASE_NAME = 'carta.db';

/**
 * Bumped whenever the statements below change. `migrate()` runs everything
 * above the stored version, so migrations are additive and ordered.
 */
export const SCHEMA_VERSION = 2;

export const MIGRATIONS: readonly (readonly string[])[] = [
  // v1 — the thin spine: a notice, and the reminders scheduled from it.
  [
    `CREATE TABLE IF NOT EXISTS notices (
       id                        TEXT PRIMARY KEY,
       captured_at               INTEGER NOT NULL,
       program_id                TEXT,
       agency                    TEXT,
       form_id                   TEXT,
       action_type               TEXT NOT NULL,
       -- Dropped again in v2. Left here because a migration is history: editing
       -- v1 to remove it made v2's DROP COLUMN fail on a fresh install, where
       -- the column had never existed. Migrations are replayed in order from
       -- zero, so the only safe edit to a shipped one is none.
       recipient_name            TEXT,
       notice_date               INTEGER,
       effective_date            INTEGER,
       deadline_date             INTEGER,
       appeal_deadline           INTEGER,
       aid_paid_pending_deadline INTEGER,
       -- Never the case number itself. Salted hash for matching two notices to
       -- one case, plus the last four so the user recognises it on screen.
       case_hash                 TEXT,
       case_last4                TEXT,
       extraction_source         TEXT NOT NULL,
       contained_ssn             INTEGER NOT NULL DEFAULT 0,
       -- App-sandbox path to the AES-256-GCM encrypted capture. Never
       -- MediaLibrary, never the camera roll, and never plaintext on disk.
       image_ref                 TEXT,
       -- AES-256-GCM ciphertext of the redacted OCR text.
       ocr_ref                   TEXT,
       status                    TEXT NOT NULL,
       locale                    TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS reminders (
       id                  TEXT PRIMARY KEY,
       notice_id           TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
       fire_at             INTEGER NOT NULL,
       tier                TEXT NOT NULL,
       urgent              INTEGER NOT NULL DEFAULT 0,
       os_notification_id  TEXT,
       state               TEXT NOT NULL
     )`,
    // Home orders by the nearest deadline, on every launch.
    `CREATE INDEX IF NOT EXISTS idx_notices_deadline ON notices(deadline_date)`,
    // Cancelling a ladder when the user marks a notice submitted.
    `CREATE INDEX IF NOT EXISTS idx_reminders_notice ON reminders(notice_id)`,
    // Finding the earlier notice on the same case — the Maria Reyes chain.
    `CREATE INDEX IF NOT EXISTS idx_notices_case ON notices(case_hash)`,
  ],

  // v2 — the recipient's name stops being a column.
  //
  // It was the most identifying value in the database and the only one stored
  // in plaintext for display convenience. It is not needed on any hot path:
  // Home shows the programme and the countdown, and the user already knows who
  // they are. Review and Notice Detail need it, and both are single-record
  // screens where one decrypt costs nothing.
  //
  // So it now comes out of the encrypted OCR text on demand and never exists
  // as a column. SQLite's DROP COLUMN needs 3.35+; expo-sqlite ships well past
  // that, and the ALTER is inside the migration transaction.
  [
    `ALTER TABLE notices DROP COLUMN recipient_name`,
    // Default on, per SPEC: the photograph's job ends once the text is out of
    // it. Kept as a row rather than a constant so Settings can turn it off for
    // someone who wants to keep the original.
    `CREATE TABLE IF NOT EXISTS settings (
       key   TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('deleteSourceImage', 'true')`,
  ],
];

export type NoticeStatus =
  | 'pending_review'
  | 'active'
  | 'completed'
  | 'dismissed'
  | 'expired';

export type ReminderState = 'scheduled' | 'fired' | 'cancelled';

/** A row of `notices`, as SQLite hands it back. */
export interface NoticeRow {
  id: string;
  captured_at: number;
  program_id: string | null;
  agency: string | null;
  form_id: string | null;
  action_type: string;
  notice_date: number | null;
  effective_date: number | null;
  deadline_date: number | null;
  appeal_deadline: number | null;
  aid_paid_pending_deadline: number | null;
  case_hash: string | null;
  case_last4: string | null;
  extraction_source: string;
  contained_ssn: number;
  image_ref: string | null;
  ocr_ref: string | null;
  status: string;
  locale: string | null;
}

export interface ReminderRow {
  id: string;
  notice_id: string;
  fire_at: number;
  tier: string;
  urgent: number;
  os_notification_id: string | null;
  state: string;
}
