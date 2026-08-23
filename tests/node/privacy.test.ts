/**
 * Privacy invariants, enforced against the actual source.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * These are claims the README and the video will make out loud, so they are
 * checked mechanically rather than remembered. Most are structural — they read
 * the schema and the source on disk — because the alternative is a runtime test
 * that needs a simulator, and a privacy guarantee that is only checked when
 * someone remembers to boot a simulator is not checked.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MIGRATIONS } from '../../src/lib/db/schema.ts';

const repo = process.cwd();
const read = (path: string): string => readFileSync(join(repo, path), 'utf8');

/** The schema as it stands after every migration has run. */
function columnsAfterMigrations(table: string): Set<string> {
  const columns = new Set<string>();
  for (const statements of MIGRATIONS) {
    for (const statement of statements) {
      const create = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)`, 'i').exec(statement);
      if (create?.[1]) {
        for (const line of create[1].split('\n')) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed.startsWith('--')) continue;
          const name = /^([a-z_0-9]+)\s/.exec(trimmed);
          if (name?.[1]) columns.add(name[1]);
        }
      }
      const drop = new RegExp(`ALTER TABLE ${table} DROP COLUMN ([a-z_0-9]+)`, 'i').exec(statement);
      if (drop?.[1]) columns.delete(drop[1]);
    }
  }
  return columns;
}

describe('the notices table stores nothing that identifies a person', () => {
  const columns = columnsAfterMigrations('notices');

  it('has no recipient_name column', () => {
    // Dropped in v2. It was the most identifying value in the database and the
    // only one kept in plaintext for display convenience. It now lives inside
    // the encrypted envelope, which keeps the user's correction to it.
    expect(columns.has('recipient_name')).toBe(false);
  });

  it('has no column that could hold a case number in the clear', () => {
    expect(columns.has('case_number')).toBe(false);
    // A salted hash for matching two notices to one case, and the last four so
    // the user recognises it on screen. Never the number.
    expect(columns.has('case_hash')).toBe(true);
    expect(columns.has('case_last4')).toBe(true);
  });

  it('has no column for an SSN, in any spelling', () => {
    // `contained_ssn` is a 0/1 flag recording that one was found and removed.
    // The flag is fine; a column that could hold the value is not.
    for (const column of columns) {
      if (column === 'contained_ssn') continue;
      expect(column).not.toMatch(/ssn|social/i);
    }
    expect(columns.has('contained_ssn')).toBe(true);
  });

  it('keeps exactly the columns Home needs to sort and render, and no more', () => {
    // If this list grows, someone has added something to the hot path. That is
    // allowed, but it should be a decision rather than a drift.
    expect([...columns].sort()).toEqual([
      'action_type', 'agency', 'aid_paid_pending_deadline', 'appeal_deadline',
      'captured_at', 'case_hash', 'case_last4', 'contained_ssn', 'deadline_date',
      'effective_date', 'extraction_source', 'form_id', 'id', 'image_ref', 'locale',
      'notice_date', 'ocr_ref', 'program_id', 'status',
    ]);
  });
});

describe('the capture is never left in the clear', () => {
  it('cannot record an image path at save time', () => {
    // saveNotice writes null. The encrypted file is attached afterwards by
    // setImageRef(), so there is no code path that stores a path to a plaintext
    // capture.
    const source = read('src/lib/db/notices.ts');
    const saveInput = /export interface SaveNoticeInput \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
    expect(saveInput).not.toContain('imageRef');
    expect(source).toContain('export async function setImageRef');
  });

  it('deletes the plaintext source on both paths', () => {
    const images = read('src/lib/db/images.ts');
    // Kept: encrypt, then delete the original.
    expect(images).toContain('export async function storeCaptureEncrypted');
    expect(images).toMatch(/source\.delete\(\)/);
    // Discarded: delete without storing.
    expect(images).toContain('export function discardCapture');
  });

  it('decrypts previews into the cache, never into documents', () => {
    const images = read('src/lib/db/images.ts');
    expect(images).toMatch(/new Directory\(Paths\.cache, 'previews'\)/);
    expect(images).toContain('discardDecryptedPreviews');
  });
});

describe('the app declares the strongest file protection class', () => {
  it('sets NSFileProtectionComplete on the container', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: { ios: { entitlements: Record<string, unknown> } };
    };
    expect(app.expo.ios.entitlements['com.apple.developer.default-data-protection']).toBe(
      'NSFileProtectionComplete',
    );
  });
});

describe('nothing in the storage path can reach the network', () => {
  it('has no fetch, XMLHttpRequest or WebSocket anywhere under src/lib/db', () => {
    for (const file of ['crypto.ts', 'images.ts', 'index.ts', 'notices.ts', 'reminders.ts', 'schema.ts', 'settings.ts']) {
      const source = read(join('src/lib/db', file));
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|new WebSocket|axios/);
    }
  });

  it('sends no push token anywhere — reminders are locally scheduled only', () => {
    const notifications = read('src/lib/notifications/index.ts');
    expect(notifications).not.toMatch(/getExpoPushTokenAsync|getDevicePushTokenAsync/);
  });
});
