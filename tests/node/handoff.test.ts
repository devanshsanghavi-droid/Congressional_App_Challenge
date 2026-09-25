/**
 * The phone-to-phone hand-off: X25519, HKDF-SHA256 and AES-256-GCM over QR frames.
 *
 * AUTHORSHIP: Claude. Tests for src/lib/handoff/protocol.ts.
 *
 * Randomness is injected, so every exchange here is reproducible. What is
 * pinned: a letter survives the trip exactly, in any frame order, with repeats;
 * frames for another session are ignored; any change to a single character is
 * refused rather than half-read; and the four-digit check code agrees on both
 * phones in an honest exchange and disagrees when someone stands in the middle.
 */

import {
  FRAME_CHARS,
  FrameCollector,
  createReceiverSession,
  fromBase64Url,
  openHandoff,
  parsePayload,
  parseReceiverCode,
  receiverCode,
  sealForReceiver,
  toBase64Url,
} from '../../src/lib/handoff/protocol.ts';
import type { HandoffPayload, RandomBytes, ReceiverSession } from '../../src/lib/handoff/protocol.ts';

/** mulberry32: deterministic bytes, so a failure reproduces. */
function seeded(seed: number): RandomBytes {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (length) => Uint8Array.from({ length }, () => Math.floor(next() * 256));
}

const letter: HandoffPayload = {
  v: 1,
  fields: {
    programId: { value: 'CalFresh', source: 'regex' },
    actionType: { value: 'recert_due', source: 'regex' },
    deadlineDate: { value: '2026-09-05', source: 'regex' },
    recipientName: { value: 'MARIA REYES', source: 'manual' },
    caseNumber: { value: '01-4472-9931', source: 'regex' },
  },
  requiredDocs: ['pay_stub', 'rent_receipt'],
  // Long enough to need many frames, as a real page does.
  ocrText: 'SEMI-ANNUAL REPORT (SAR 7)\n'.repeat(120),
  locale: 'es',
};

function exchange(seed = 1): { receiver: ReceiverSession; frames: readonly string[]; checkCode: string } {
  const random = seeded(seed);
  const receiver = createReceiverSession(random);
  const sealed = sealForReceiver(letter, receiverCode(receiver), random);
  if (!sealed) throw new Error('did not seal');
  return { receiver, frames: sealed.frames, checkCode: sealed.checkCode };
}

describe('a letter crosses from one phone to the other intact', () => {
  it('in order', () => {
    const { receiver, frames, checkCode } = exchange();
    expect(frames.length).toBeGreaterThan(5);
    const collector = new FrameCollector(receiver);
    frames.forEach((f) => collector.accept(f));
    const opened = openHandoff(collector, receiver);
    expect(opened).toEqual({ ok: true, payload: letter, checkCode });
  });

  it('out of order and with repeats, the way a camera catches a loop', () => {
    const { receiver, frames } = exchange(2);
    const shuffled = [...frames].reverse();
    const collector = new FrameCollector(receiver);
    for (const f of [...shuffled.slice(0, 3), ...shuffled, ...shuffled.slice(0, 3)]) collector.accept(f);
    expect(collector.progress()).toEqual({ have: frames.length, total: frames.length, complete: true });
    const opened = openHandoff(collector, receiver);
    expect(opened.ok && opened.payload).toEqual(letter);
  });

  it('reports progress as parts arrive', () => {
    const { receiver, frames } = exchange(3);
    const collector = new FrameCollector(receiver);
    expect(collector.accept(frames[0]!)).toEqual({ have: 1, total: frames.length, complete: false });
    expect(collector.accept(frames[0]!)).toEqual({ have: 1, total: frames.length, complete: false });
    expect(openHandoff(collector, receiver)).toEqual({ ok: false, reason: 'incomplete' });
  });

  it('keeps each frame small enough to scan off a phone screen', () => {
    for (const frame of exchange(4).frames) expect(frame.length).toBeLessThanOrEqual(FRAME_CHARS + 80);
  });
});

describe('what the receiving phone refuses', () => {
  it('frames meant for another phone', () => {
    const mine = exchange(5);
    const theirs = exchange(6);
    const collector = new FrameCollector(mine.receiver);
    for (const f of theirs.frames) expect(collector.accept(f)).toBeUndefined();
    expect(collector.progress().have).toBe(0);
  });

  it('anything that is not a Carta frame', () => {
    const { receiver } = exchange(7);
    const collector = new FrameCollector(receiver);
    for (const junk of ['', 'https://example.com', 'CARTA1D', 'CARTA1D.a.b.c.d.e', 'CARTA1D.x.y.0.1.zz']) {
      expect(collector.accept(junk)).toBeUndefined();
    }
  });

  it('a message with one character changed, rather than reading part of it', () => {
    const { receiver, frames } = exchange(8);
    const tampered = [...frames];
    const last = tampered[3]!;
    const flipped = last.slice(0, -1) + (last.endsWith('A') ? 'B' : 'A');
    tampered[3] = flipped;
    const collector = new FrameCollector(receiver);
    tampered.forEach((f) => collector.accept(f));
    expect(openHandoff(collector, receiver)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('a mix of frames from two senders for the same phone', () => {
    const random = seeded(9);
    const receiver = createReceiverSession(random);
    const a = sealForReceiver(letter, receiverCode(receiver), random)!;
    const b = sealForReceiver(letter, receiverCode(receiver), random)!;
    const collector = new FrameCollector(receiver);
    collector.accept(a.frames[0]!);
    // Same session, different sender key: ignored, never spliced in.
    expect(collector.accept(b.frames[1]!)).toBeUndefined();
  });
});

describe('the check code', () => {
  it('is four digits and matches on both phones', () => {
    const { receiver, frames, checkCode } = exchange(10);
    expect(checkCode).toMatch(/^\d{4}$/);
    const collector = new FrameCollector(receiver);
    frames.forEach((f) => collector.accept(f));
    const opened = openHandoff(collector, receiver);
    expect(opened.ok && opened.checkCode).toBe(checkCode);
  });

  it('does not match when someone stands in the middle', () => {
    // The helper scans an attacker's code instead of the family's; the
    // attacker re-encrypts for the family. Each side's code comes from a
    // different shared secret, so the two screens disagree.
    const random = seeded(11);
    const family = createReceiverSession(random);
    const attacker = createReceiverSession(random);
    const toAttacker = sealForReceiver(letter, receiverCode(attacker), random)!;
    const toFamily = sealForReceiver(letter, receiverCode(family), random)!;
    const collector = new FrameCollector(family);
    toFamily.frames.forEach((f) => collector.accept(f));
    const opened = openHandoff(collector, family);
    expect(opened.ok).toBe(true);
    expect(opened.ok && opened.checkCode).not.toBe(toAttacker.checkCode);
  });
});

describe('codes and encoding', () => {
  it('reads back its own receiver code and nothing else', () => {
    const receiver = createReceiverSession(seeded(12));
    const parsed = parseReceiverCode(receiverCode(receiver));
    expect(parsed?.publicKey).toEqual(receiver.publicKey);
    expect(parsed?.sessionId).toEqual(receiver.sessionId);
    for (const junk of ['', 'CARTA1K', 'CARTA1K.abc.def', `CARTA2K.${toBase64Url(receiver.publicKey)}.${toBase64Url(receiver.sessionId)}`]) {
      expect(parseReceiverCode(junk)).toBeUndefined();
    }
  });

  it('will not seal for a code that is not a Carta receiver code', () => {
    expect(sealForReceiver(letter, 'https://example.com/steal', seeded(13))).toBeUndefined();
  });

  it('round-trips base64url at every length', () => {
    const random = seeded(14);
    for (let n = 0; n < 50; n++) {
      const bytes = random(n);
      const text = toBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(text)).toEqual(bytes);
    }
    expect(fromBase64Url('not base64!')).toBeUndefined();
  });
});

describe('what the family phone accepts from a helper', () => {
  it('keeps the fields Review knows and drops anything else', () => {
    const payload = parsePayload({
      v: 1,
      fields: {
        deadlineDate: { value: '2026-09-05', source: 'regex', sourceLineIndexes: [3, 4] },
        caseNumber: { value: 42, source: 'regex' },
        programId: { value: 'CalFresh', source: 'made-up', invalid: 'nonsense' },
        somethingElse: { value: 'x', source: 'regex' },
      },
      requiredDocs: ['pay_stub', 7, null],
    });
    expect(payload).toEqual({
      v: 1,
      fields: {
        deadlineDate: { value: '2026-09-05', source: 'regex' },
        caseNumber: { source: 'regex' },
        programId: { value: 'CalFresh', source: 'manual' },
      },
      requiredDocs: ['pay_stub'],
    });
  });

  it('refuses a payload of the wrong version or shape', () => {
    expect(parsePayload({ v: 2, fields: {}, requiredDocs: [] })).toBeUndefined();
    expect(parsePayload({ v: 1, fields: null, requiredDocs: [] })).toBeUndefined();
    expect(parsePayload({ v: 1, fields: {}, requiredDocs: 'pay_stub' })).toBeUndefined();
    expect(parsePayload('hello')).toBeUndefined();
  });
});
