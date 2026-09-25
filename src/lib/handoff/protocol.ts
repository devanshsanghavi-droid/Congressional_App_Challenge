/**
 * Passing a confirmed letter from a helper's phone to the family's phone, with
 * no internet, no Bluetooth pairing and no account: only the two cameras.
 *
 * AUTHORSHIP: Claude. App-side, pure (randomness is passed in), so the whole
 * exchange runs in the Node tests.
 *
 * WHY THIS EXISTS
 * ---------------
 * The people who get a family through a renewal are often not the family: a
 * county navigator, a clinic worker, a grown child. KFF's unwinding survey found
 * a case worker or navigator was the most common source of help (19% of
 * enrollees who tried to renew). The helper is the one who can read the letter
 * and confirm the fields; the family is the one who needs the countdown. This
 * moves the confirmed letter from one phone to the other and, used from Review,
 * never stores it on the helper's phone at all.
 *
 * THE EXCHANGE
 * ------------
 *   1. The family's phone makes a one-time X25519 key pair and shows the public
 *      half as a QR code, with a random session id.
 *   2. The helper's phone scans it, makes its own one-time key pair, and derives
 *      the shared secret. HKDF-SHA256 over that secret (salted with the session
 *      id) gives an AES-256-GCM key, the same cipher Carta uses for everything
 *      it stores.
 *   3. The helper's phone encrypts the letter and shows it as a loop of QR
 *      frames, each carrying its index, until the family's phone has them all.
 *   4. The family's phone rebuilds the message, derives the same key from its
 *      private half and the helper's public key (in every frame), and decrypts.
 *
 * Someone who photographs both screens has two public keys and a ciphertext,
 * which is not enough to read anything. What they could do, in principle, is
 * stand in the middle: show the helper their own key instead of the family's.
 * So both phones show a four-digit check code derived from the shared secret,
 * and the family is told to confirm it matches before saving. It is a
 * lightweight defence for a face-to-face exchange, not a claim of strength, and
 * the screens do not dress it up as one.
 *
 * The family's phone then opens the letter on its own Review screen, where the
 * family confirms every field again before anything is scheduled (CLAUDE.md §3
 * rule 6 applies to them too: it is their letter and their reminders).
 */

import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { ExtractedField, ExtractedNotice } from '../extraction-port/port.ts';

export type RandomBytes = (length: number) => Uint8Array;

/** What travels: the confirmed letter, never the photo. */
export interface HandoffPayload {
  readonly v: 1;
  readonly fields: ExtractedNotice;
  /** Document-type ids the letter asked for. */
  readonly requiredDocs: readonly string[];
  /** The redacted recognised text, so the family's phone can explain the letter too. */
  readonly ocrText?: string;
  readonly locale?: string;
}

const RECEIVER_PREFIX = 'CARTA1K';
const FRAME_PREFIX = 'CARTA1D';
const INFO = new TextEncoder().encode('carta-handoff-v1');
const CHECK_INFO = new TextEncoder().encode('carta-handoff-check-v1');
/** Characters of ciphertext per QR frame: small enough to scan quickly off a phone screen. */
export const FRAME_CHARS = 260;

// -- base64url, without padding (QR-safe, no dependency on atob/btoa in Hermes)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] as string;
    out += ALPHABET[(n >> 12) & 63] as string;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63] as string;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63] as string;
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const values = [...chunk].map((ch) => ALPHABET.indexOf(ch));
    const n = ((values[0] ?? 0) << 18) | ((values[1] ?? 0) << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return new Uint8Array(out);
}

// -- the receiving phone

export interface ReceiverSession {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly sessionId: Uint8Array;
}

export function createReceiverSession(random: RandomBytes): ReceiverSession {
  const privateKey = random(32);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey), sessionId: random(8) };
}

/** What the receiving phone shows as its QR code. */
export function receiverCode(session: ReceiverSession): string {
  return `${RECEIVER_PREFIX}.${toBase64Url(session.publicKey)}.${toBase64Url(session.sessionId)}`;
}

export function parseReceiverCode(code: string): { publicKey: Uint8Array; sessionId: Uint8Array } | undefined {
  const [prefix, key, sid, ...rest] = code.trim().split('.');
  if (prefix !== RECEIVER_PREFIX || rest.length > 0 || key === undefined || sid === undefined) return undefined;
  const publicKey = fromBase64Url(key);
  const sessionId = fromBase64Url(sid);
  if (!publicKey || publicKey.length !== 32 || !sessionId || sessionId.length !== 8) return undefined;
  return { publicKey, sessionId };
}

function deriveKey(shared: Uint8Array, sessionId: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, sessionId, INFO, 32);
}

/** Four digits both phones can show, derived from the shared secret. */
function checkCodeFrom(shared: Uint8Array, sessionId: Uint8Array): string {
  const bytes = hkdf(sha256, shared, sessionId, CHECK_INFO, 4);
  const n = (((bytes[0] as number) << 24) | ((bytes[1] as number) << 16) | ((bytes[2] as number) << 8) | (bytes[3] as number)) >>> 0;
  return String(n % 10_000).padStart(4, '0');
}

// -- the helper's phone

export interface SealedHandoff {
  /** Show these in a loop until the other phone has them all. */
  readonly frames: readonly string[];
  /** Show this too; the family checks it matches their screen. */
  readonly checkCode: string;
}

/** Encrypt a letter for the phone whose code was scanned. Undefined if the code is not a Carta receiver code. */
export function sealForReceiver(payload: HandoffPayload, scannedCode: string, random: RandomBytes): SealedHandoff | undefined {
  const receiver = parseReceiverCode(scannedCode);
  if (!receiver) return undefined;
  const senderPrivate = random(32);
  const senderPublic = x25519.getPublicKey(senderPrivate);
  const shared = x25519.getSharedSecret(senderPrivate, receiver.publicKey);
  const key = deriveKey(shared, receiver.sessionId);
  const nonce = random(12);
  const ciphertext = gcm(key, nonce).encrypt(new TextEncoder().encode(JSON.stringify(payload)));

  const blob = toBase64Url(new Uint8Array([...nonce, ...ciphertext]));
  const total = Math.max(1, Math.ceil(blob.length / FRAME_CHARS));
  const session = toBase64Url(receiver.sessionId);
  const sender = toBase64Url(senderPublic);
  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    frames.push(`${FRAME_PREFIX}.${session}.${sender}.${i + 1}.${total}.${blob.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS)}`);
  }
  return { frames, checkCode: checkCodeFrom(shared, receiver.sessionId) };
}

// -- back on the receiving phone

export interface FrameProgress {
  readonly have: number;
  readonly total: number;
  readonly complete: boolean;
}

/**
 * Collects frames in any order, ignores repeats and anything from another
 * session, and rebuilds the message once every piece is in.
 */
export class FrameCollector {
  private readonly session: string;
  private readonly parts = new Map<number, string>();
  private total = 0;
  private sender: string | undefined;

  constructor(receiver: ReceiverSession) {
    this.session = toBase64Url(receiver.sessionId);
  }

  /** Returns the progress, or undefined for a frame that is not ours. */
  accept(frame: string): FrameProgress | undefined {
    const pieces = frame.trim().split('.');
    if (pieces.length !== 6 || pieces[0] !== FRAME_PREFIX || pieces[1] !== this.session) return undefined;
    const index = Number(pieces[3]);
    const total = Number(pieces[4]);
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > 200 || index < 1 || index > total) {
      return undefined;
    }
    if (this.sender !== undefined && pieces[2] !== this.sender) return undefined;
    if (this.total !== 0 && total !== this.total) return undefined;
    this.sender = pieces[2];
    this.total = total;
    this.parts.set(index, pieces[5] as string);
    return this.progress();
  }

  progress(): FrameProgress {
    return { have: this.parts.size, total: this.total, complete: this.total > 0 && this.parts.size === this.total };
  }

  /** The reassembled message, once complete. */
  assembled(): { sender: string; blob: string } | undefined {
    if (!this.progress().complete || this.sender === undefined) return undefined;
    let blob = '';
    for (let i = 1; i <= this.total; i++) blob += this.parts.get(i) as string;
    return { sender: this.sender, blob };
  }
}

export type Opened =
  | { readonly ok: true; readonly payload: HandoffPayload; readonly checkCode: string }
  | { readonly ok: false; readonly reason: 'incomplete' | 'unreadable' };

const FIELD_KEYS = [
  'recipientName',
  'caseNumber',
  'programId',
  'agency',
  'formId',
  'actionType',
  'noticeDate',
  'deadlineDate',
  'effectiveDate',
  'appealDeadline',
  'aidPaidPendingDeadline',
] as const satisfies readonly (keyof ExtractedNotice)[];
const SOURCES: readonly string[] = ['manual', 'regex', 'llm', 'llm_corrected'];
const INVALID: readonly string[] = ['implausible_date', 'out_of_range', 'malformed', 'failed_checksum'];
const MAX_VALUE = 200;
const MAX_TEXT = 20_000;
const MAX_DOCS = 40;

function cleanField(raw: unknown): ExtractedField | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const value = typeof r['value'] === 'string' ? r['value'].slice(0, MAX_VALUE) : undefined;
  const source = typeof r['source'] === 'string' && SOURCES.includes(r['source']) ? r['source'] : 'manual';
  const invalid = typeof r['invalid'] === 'string' && INVALID.includes(r['invalid']) ? r['invalid'] : undefined;
  return {
    source: source as ExtractedField['source'],
    ...(value === undefined ? {} : { value }),
    ...(invalid === undefined ? {} : { invalid: invalid as NonNullable<ExtractedField['invalid']> }),
  };
}

/**
 * Rebuild a payload from decrypted JSON, keeping only what Review understands.
 *
 * Only the phone that scanned this phone's code can have encrypted it, so this
 * is not a defence against a stranger. It is a defence against a different
 * version of Carta, or a bug, putting a shape on the family's Review screen
 * that the screen cannot render. Line indexes are dropped: they point into a
 * photo that stayed on the helper's phone.
 */
export function parsePayload(raw: unknown): HandoffPayload | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r['v'] !== 1 || typeof r['fields'] !== 'object' || r['fields'] === null || !Array.isArray(r['requiredDocs'])) {
    return undefined;
  }
  const rawFields = r['fields'] as Record<string, unknown>;
  const fields: Partial<Record<(typeof FIELD_KEYS)[number], ExtractedField>> = {};
  for (const key of FIELD_KEYS) {
    const field = cleanField(rawFields[key]);
    if (field !== undefined) fields[key] = field;
  }
  const requiredDocs = (r['requiredDocs'] as unknown[])
    .filter((d): d is string => typeof d === 'string' && d.length <= MAX_VALUE)
    .slice(0, MAX_DOCS);
  const ocrText = typeof r['ocrText'] === 'string' ? r['ocrText'].slice(0, MAX_TEXT) : undefined;
  const locale = typeof r['locale'] === 'string' ? r['locale'].slice(0, 16) : undefined;
  return {
    v: 1,
    fields: fields as ExtractedNotice,
    requiredDocs,
    ...(ocrText === undefined ? {} : { ocrText }),
    ...(locale === undefined ? {} : { locale }),
  };
}

/** Decrypt what the collector gathered. Any tampering makes GCM refuse, and this says so rather than guessing. */
export function openHandoff(collector: FrameCollector, receiver: ReceiverSession): Opened {
  const message = collector.assembled();
  if (!message) return { ok: false, reason: 'incomplete' };
  const senderPublic = fromBase64Url(message.sender);
  const bytes = fromBase64Url(message.blob);
  if (!senderPublic || senderPublic.length !== 32 || !bytes || bytes.length <= 12) return { ok: false, reason: 'unreadable' };
  try {
    const shared = x25519.getSharedSecret(receiver.privateKey, senderPublic);
    const key = deriveKey(shared, receiver.sessionId);
    const plaintext = gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12));
    const payload = parsePayload(JSON.parse(new TextDecoder().decode(plaintext)));
    if (payload === undefined) return { ok: false, reason: 'unreadable' };
    return { ok: true, payload, checkCode: checkCodeFrom(shared, receiver.sessionId) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
