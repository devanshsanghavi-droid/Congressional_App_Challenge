/**
 * The photograph, encrypted at rest.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * The picture of the letter is not less sensitive than the text of the letter —
 * it contains the recipient's name, their home address and their case number,
 * rendered legibly. Encrypting the OCR text and leaving the JPEG in the clear
 * would protect the copy and not the original, which is not a defensible thing
 * to claim.
 *
 * So the capture is encrypted with the same AES-256-GCM key the notice text
 * uses, and the plaintext original is removed. Cost is on a cold path only:
 * decryption happens when the user taps "view original", which is rare, and
 * never on Home or during extraction.
 *
 * Defence in depth, not instead of: `com.apple.developer.default-data-protection`
 * is set to `NSFileProtectionComplete` in app.json, so iOS also keeps these
 * files unreadable while the device is locked.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { decryptBytes, encryptBytes } from './crypto.ts';

const IMAGE_DIR = 'notices';

/** `.enc` rather than `.jpg`: nothing should try to render this as an image. */
function encryptedFileFor(noticeId: string): File {
  const directory = new Directory(Paths.document, IMAGE_DIR);
  if (!directory.exists) directory.create({ intermediates: true });
  return new File(directory, `${noticeId}.enc`);
}

/**
 * Encrypt a captured photo into the notice store and delete the plaintext.
 *
 * Returns the stored path, or undefined if there was nothing to store. The
 * original is removed whether or not the caller asked for `deleteSource`,
 * because after this call the plaintext copy is redundant *and* it is the copy
 * with no protection on it.
 */
export async function storeCaptureEncrypted(
  noticeId: string,
  sourceUri: string,
): Promise<string | undefined> {
  const source = new File(sourceUri);
  if (!source.exists) return undefined;

  const plaintext = await source.bytes();
  const ciphertext = await encryptBytes(plaintext);
  const target = encryptedFileFor(noticeId);
  target.write(ciphertext);

  // The camera's temporary file has served its purpose. Leaving it would mean
  // an unencrypted copy of the letter sitting in the cache directory.
  try {
    source.delete();
  } catch {
    // A source that cannot be deleted is not worth failing a save over; the
    // encrypted copy is already written. Reported by `plaintextRemains()`.
  }
  return target.uri;
}

/**
 * Delete a capture without storing it, for the default path where the source
 * image is discarded after extraction.
 */
export function discardCapture(sourceUri: string): void {
  try {
    const source = new File(sourceUri);
    if (source.exists) source.delete();
  } catch {
    // Nothing to do: the file is already gone or was never ours.
  }
}

/** True if a plaintext capture is still on disk — used by the privacy test. */
export function plaintextRemains(sourceUri: string): boolean {
  try {
    return new File(sourceUri).exists;
  } catch {
    return false;
  }
}

/**
 * Decrypt a stored capture for display.
 *
 * Writes the plaintext to the **cache** directory, not documents: the cache is
 * evictable by iOS and is cleared by `discardDecryptedPreviews()` when the user
 * leaves the screen, so a decrypted copy does not outlive the moment it was
 * needed for.
 */
export async function decryptCaptureForDisplay(noticeId: string): Promise<string | undefined> {
  const stored = encryptedFileFor(noticeId);
  if (!stored.exists) return undefined;

  const previews = new Directory(Paths.cache, 'previews');
  if (!previews.exists) previews.create({ intermediates: true });
  const plaintext = await decryptBytes(await stored.bytes());
  const preview = new File(previews, `${noticeId}.jpg`);
  preview.write(plaintext);
  return preview.uri;
}

/** Drop every decrypted preview. Called when a viewer closes. */
export function discardDecryptedPreviews(): void {
  const previews = new Directory(Paths.cache, 'previews');
  if (previews.exists) previews.delete();
}

export function deleteStoredCapture(noticeId: string): void {
  const stored = encryptedFileFor(noticeId);
  if (stored.exists) stored.delete();
}

/** Wipe every stored capture. Part of "Delete everything". */
export function deleteAllStoredCaptures(): void {
  const directory = new Directory(Paths.document, IMAGE_DIR);
  if (directory.exists) directory.delete();
  discardDecryptedPreviews();
}
