/**
 * "Delete everything" — the whole of it, in one place.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE FUNCTION AND NOT FOUR CALLS IN A SCREEN
 * ---------------------------------------------------------------------------
 * Carta's privacy claim is that nothing leaves the phone. The corollary the user
 * actually cares about is that they can get it *off* the phone, completely, and
 * that is only true if all four stores go:
 *
 *   1. **Scheduled notifications**, which live in iOS and not in this app. A
 *      wipe that skips them leaves the OS holding banners naming a programme and
 *      a deadline, firing for weeks after the user believed they had erased
 *      everything. This is the one an app is most likely to forget, because it
 *      is the one store that is not ours.
 *   2. **The database** — every table, not the two that used to be here. See
 *      `deleteAllData`: `documents` does not cascade, so the Vault used to
 *      survive a wipe.
 *   3. **The encrypted image files**, plus any decrypted previews sitting in the
 *      cache. The previews are plaintext by construction — that is what a
 *      preview is — so leaving them is leaving the most legible copy of the
 *      letter on disk.
 *   4. **The keychain entries.** Deleting the key is what makes it irreversible:
 *      undeleted ciphertext without a key is noise, but ciphertext *with* the
 *      key still sitting in the keychain is just a file someone has not opened.
 *
 * Spread across a screen's button handler, one of these gets dropped in an edit
 * and nothing fails. Here, `wipeEverything()` is a single thing to call and a
 * single thing to test.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT STOP AT THE FIRST FAILURE
 * ---------------------------------------------------------------------------
 * Every step runs even if an earlier one throws, and the failures are collected
 * and returned. A wipe that aborts halfway because the keychain was busy would
 * leave the user in the worst possible state — believing the data is gone, with
 * most of it still there. Partial progress in a destructive operation is better
 * than none, and the caller is told exactly what did not go so it can say so
 * rather than claiming success.
 *
 * The model is deliberately NOT deleted. It is a ~1 GB download that contains
 * none of the user's data, and re-downloading it on a metered connection because
 * they cleared their notices would be a hostile surprise. Settings deletes it
 * separately, by its own button, with its size on the label.
 */

import { deleteAllData } from './db/index.ts';
import { destroyKeys } from './db/crypto.ts';
import { deleteAllStoredCaptures, discardDecryptedPreviews } from './db/images.ts';
import { cancelAll } from './notifications/index.ts';

export interface WipeResult {
  /** True when every step completed. */
  readonly complete: boolean;
  /**
   * What failed, named by step, for a message that tells the truth. Empty when
   * `complete` is true.
   */
  readonly failed: readonly string[];
}

/** One step of the wipe. Named so a failure can be reported as a thing, not an index. */
interface Step {
  readonly name: string;
  readonly run: () => Promise<void> | void;
}

/**
 * Erase everything Carta holds.
 *
 * Notifications go **first**: they are the store outside this app, and if the
 * process is killed mid-wipe the worst remaining state is data on disk that the
 * user can delete again — not a banner naming their case number arriving on a
 * phone they thought they had cleared.
 */
export async function wipeEverything(): Promise<WipeResult> {
  const steps: readonly Step[] = [
    { name: 'notifications', run: () => cancelAll() },
    { name: 'database', run: () => deleteAllData() },
    { name: 'images', run: () => deleteAllStoredCaptures() },
    { name: 'previews', run: () => discardDecryptedPreviews() },
    // Last, because it is the irreversible one: if it runs first and a later
    // step fails, the leftover rows are unreadable even to a retry.
    { name: 'keys', run: () => destroyKeys() },
  ];

  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch {
      failed.push(step.name);
    }
  }

  return { complete: failed.length === 0, failed };
}
