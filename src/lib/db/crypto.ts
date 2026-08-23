/**
 * Field-level encryption and the key that backs it.
 *
 * AUTHORSHIP: Claude. App-side (CLAUDE.md §7).
 *
 * SPEC §6 stores notice text and explanations encrypted, with the key in the
 * device keychain. SQLCipher was cut in the v2 re-scope, so the encryption is
 * per-field rather than whole-database: the columns that hold what the letter
 * actually said are ciphertext, the columns the app queries on (dates, status)
 * are not.
 *
 * That is a deliberate trade and worth being straight about. Whole-database
 * encryption would also cover the deadline dates; this does not. What it does
 * cover is the part that identifies a person and their circumstances — the
 * recognised text of the notice — which is the material that would actually
 * harm someone if the file were read.
 *
 * **AES-256-GCM**, authenticated: a tampered or truncated ciphertext throws on
 * decrypt rather than returning plausible garbage. Implementation is
 * `@noble/ciphers` — audited, zero dependencies, pure JS, so it works under
 * Hermes with no native module and no bridge.
 *
 * Nothing here reaches the network. The key never leaves the device and is
 * never included in a backup that leaves the device (see `KEYCHAIN_OPTIONS`).
 */

import { gcm } from '@noble/ciphers/aes.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_ALIAS = 'carta.field-key.v1';
const CASE_SALT_ALIAS = 'carta.case-salt.v1';

/**
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — the key is unavailable while the phone is
 * locked, and it is excluded from iCloud Keychain and from encrypted backups.
 * A restore onto a new device therefore cannot read the old notices. That is
 * the right trade for this app: the data is re-photographable, and a benefits
 * history syncing to a household iCloud account is a real harm.
 */
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const KEY_BYTES = 32;
const NONCE_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Fetch the key, creating it on first run. */
async function getOrCreateSecret(alias: string, byteLength: number): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(alias, KEYCHAIN_OPTIONS);
  if (existing !== null) return fromBase64(existing);

  const created = Crypto.getRandomBytes(byteLength);
  await SecureStore.setItemAsync(alias, toBase64(created), KEYCHAIN_OPTIONS);
  return created;
}

let cachedKey: Uint8Array | undefined;

export async function getFieldKey(): Promise<Uint8Array> {
  cachedKey ??= await getOrCreateSecret(KEY_ALIAS, KEY_BYTES);
  return cachedKey;
}

/**
 * Encrypt a string for storage. Output is `base64(nonce) + "." + base64(ct)`.
 *
 * A fresh random nonce per call, never a counter: GCM catastrophically loses
 * confidentiality if a nonce repeats under the same key, and a counter that
 * resets after a reinstall or a restore is exactly how that happens.
 */
export async function encryptField(plaintext: string): Promise<string> {
  const key = await getFieldKey();
  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  return `${toBase64(nonce)}.${toBase64(ciphertext)}`;
}

/**
 * Encrypt raw bytes — the photograph.
 *
 * A separate entry point from `encryptField` rather than base64-in-a-string,
 * because a 400 KB JPEG round-tripped through base64 is a 550 KB string and two
 * needless copies. GCM takes bytes; give it bytes.
 */
export async function encryptBytes(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await getFieldKey();
  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  // nonce ‖ ciphertext, so the file is self-describing and nothing else has to
  // remember where the nonce went.
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export async function decryptBytes(stored: Uint8Array): Promise<Uint8Array> {
  if (stored.length <= NONCE_BYTES) throw new Error('encrypted file is truncated');
  const key = await getFieldKey();
  const nonce = stored.subarray(0, NONCE_BYTES);
  return gcm(key, nonce).decrypt(stored.subarray(NONCE_BYTES));
}

/** Throws if the value was tampered with, truncated, or written under another key. */
export async function decryptField(stored: string): Promise<string> {
  const [noncePart, cipherPart] = stored.split('.');
  if (noncePart === undefined || cipherPart === undefined) {
    throw new Error('encrypted field is malformed');
  }
  const key = await getFieldKey();
  const plaintext = gcm(key, fromBase64(noncePart)).decrypt(fromBase64(cipherPart));
  return new TextDecoder().decode(plaintext);
}

export interface CaseNumberRecord {
  /** Salted SHA-256, hex. Lets two notices be matched to one case. */
  readonly hash: string;
  /** The last four characters, which is what the UI shows. */
  readonly last4: string;
}

/**
 * A case number is never stored in full (CLAUDE.md §3 rule 5).
 *
 * The app needs to know that two notices belong to the same case — that is the
 * whole Maria Reyes chain, notice 01 to notice 02 — but it does not need the
 * number to do it. A salted hash matches, and the last four are enough for the
 * user to recognise their own case on screen.
 *
 * The salt is per-install and lives in the keychain, so the hashes are not
 * comparable across devices and a stolen database cannot be attacked with a
 * dictionary of county case numbers.
 */
export async function hashCaseNumber(caseNumber: string): Promise<CaseNumberRecord> {
  const normalised = caseNumber.replace(/\s+/g, '').toUpperCase();
  const salt = await getOrCreateSecret(CASE_SALT_ALIAS, 16);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${toBase64(salt)}:${normalised}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { hash, last4: normalised.slice(-4) };
}

/**
 * Wipe the keys. Every encrypted field becomes permanently unreadable, which is
 * what makes "Delete everything" in Settings (SPEC §7) actually mean it — the
 * rows can go at leisure, the data is gone the moment the key is.
 */
export async function destroyKeys(): Promise<void> {
  cachedKey = undefined;
  await SecureStore.deleteItemAsync(KEY_ALIAS, KEYCHAIN_OPTIONS);
  await SecureStore.deleteItemAsync(CASE_SALT_ALIAS, KEYCHAIN_OPTIONS);
}
