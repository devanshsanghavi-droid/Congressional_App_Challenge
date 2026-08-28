/**
 * ⭐ THE NETWORK TEST — SPEC §8.3, CLAUDE.md §3 rule 1, §11.
 *
 * AUTHORSHIP: Claude. App-side test.
 *
 * Carta's central privacy claim is that **no code path that touches notice data
 * ever reaches the network**. Not "we do not call an API", not "the data is
 * encrypted in transit" — the data never leaves the phone, so there is nothing
 * in transit. Exactly one network call exists in the whole app: the
 * user-initiated, wifi-gated model download in Settings, which touches no
 * notice data and lives outside this pipeline.
 *
 * A claim like that is worth nothing as prose. This is the test that makes it
 * checkable, and it is referenced by filename in the README and the video.
 *
 * ---------------------------------------------------------------------------
 * TWO HALVES, AND WHY NEITHER IS ENOUGH ALONE
 * ---------------------------------------------------------------------------
 * **1. Runtime.** Every network primitive React Native exposes is replaced with
 * a function that throws and records the attempt — `fetch`, `XMLHttpRequest`,
 * `WebSocket`, `navigator.sendBeacon`, and the `Networking` and `WebSocketModule`
 * native modules underneath them, which is what a library would reach for if it
 * wanted to bypass the JS-level globals. Then the notice-data path runs over
 * every OCR record in the corpus. Any attempt fails the build.
 *
 * Its limit: it only proves the lines it executes are clean.
 *
 * **2. Static.** Every module reachable from the notice-data path is read off
 * disk as bytes and checked for any reference to a networking API at all. This
 * covers the branches the runtime half does not happen to take — an error
 * handler that phones home, a crash reporter behind a flag.
 *
 * Its limit: it cannot see through an indirection.
 *
 * Together they are strong. Neither is a proof, and this file should not claim
 * to be one — what it is, is the difference between a promise and a build gate.
 *
 * The self-test screen (`carta://selftest`) covers the native stages this
 * cannot: OCR, image resizing and the real SQLite writes all need a device.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { extractNotice } from '../../src/lib/extraction-port/adapter';
import { FIELD_ORDER, effectiveRisk, fieldNeedingAttention } from '../../src/lib/extraction-port/port';
import { checkOrientation, shouldWarnUpsideDown } from '../../src/lib/ocr/orientation';
import { isoToLocalMs, localMsToIso } from '../../src/lib/dates';
import { countdownDate, countdownTier, isUrgent, remindersFor } from '../../src/lib/urgency';
import type { ActionType } from '../../src/lib/urgency';
import { parseCrossReferences, parseDocTypes, parseOffices } from '../../src/lib/content/parse';
import { checkExplanation, parseSections } from '../../src/lib/llm/explain-check';
import { buildExplanationTurns } from '../../src/lib/llm/explain-grammar';
import { progressOf } from '../../src/lib/checklist';

const REPO_ROOT = join(__dirname, '..', '..');
const OCR_DIR = join(REPO_ROOT, 'tools/corpus/ocr/apple-vision');

/** Every attempt anything made to open a socket, with the URL it wanted. */
const attempts: string[] = [];

function forbid(api: string) {
  return (...args: unknown[]): never => {
    const target = typeof args[0] === 'string' ? args[0] : String(args[1] ?? '');
    attempts.push(`${api}(${target})`);
    throw new Error(
      `NETWORK ATTEMPT: ${api} -> ${target}. Carta must never reach the network on a ` +
        'path that touches notice data (CLAUDE.md §3 rule 1).',
    );
  };
}

const saved: Record<string, unknown> = {};

beforeAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;

  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
    saved[api] = target[api];
    target[api] = forbid(api);
  }

  saved['sendBeacon'] = (target['navigator'] as { sendBeacon?: unknown } | undefined)?.sendBeacon;
  if (target['navigator'] !== undefined) {
    (target['navigator'] as Record<string, unknown>)['sendBeacon'] = forbid('navigator.sendBeacon');
  }

  // The bridge underneath the globals. A library that wanted to dodge a patched
  // `fetch` would call these directly, so patching only the globals would be
  // security theatre — it would test the polite path and miss the impolite one.
  //
  // Wrapped in try/catch per module: which of these exist depends on the RN
  // version, and a missing one must not fail the suite for the wrong reason.
  // Whether the patch landed is asserted below, not assumed.
  const patchedModules: string[] = [];
  for (const name of ['Networking', 'WebSocketModule', 'BlobModule']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const registry = require('react-native/Libraries/BatchedBridge/NativeModules');
      const modules = (registry.default ?? registry) as Record<string, Record<string, unknown>>;
      const module = modules[name];
      if (module === undefined) continue;
      for (const key of Object.keys(module)) {
        if (typeof module[key] === 'function') module[key] = forbid(`${name}.${key}`);
      }
      patchedModules.push(name);
    } catch {
      // Module not present in this RN build; the globals above still cover it.
    }
  }
  saved['patchedModules'] = patchedModules;
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
    target[api] = saved[api];
  }
});

beforeEach(() => {
  attempts.length = 0;
});

interface OcrRecord {
  readonly file: string;
  readonly lines: readonly { text: string; confidence: number; box: { x: number; y: number; w: number; h: number } }[];
  readonly ocrWidth: number;
  readonly ocrHeight: number;
}

function corpusRecords(): OcrRecord[] {
  return readdirSync(OCR_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(OCR_DIR, name), 'utf8')) as OcrRecord);
}

/** A fixed clock: the corpus is dated, and a moving `now` moves the tiers. */
const CLOCK = isoToLocalMs('2026-08-24') ?? 0;

describe('the poison is actually poison', () => {
  // If the patch silently failed, every assertion below would pass while
  // proving nothing. This is the test for the test.
  it('throws on fetch', () => {
    expect(() => (globalThis as unknown as { fetch: () => void }).fetch()).toThrow(/NETWORK ATTEMPT/);
  });

  it('throws on XMLHttpRequest', () => {
    expect(() => new (globalThis as unknown as { XMLHttpRequest: new () => void }).XMLHttpRequest()).toThrow(
      /NETWORK ATTEMPT/,
    );
  });

  it('throws on WebSocket', () => {
    expect(() => new (globalThis as unknown as { WebSocket: new () => void }).WebSocket()).toThrow(
      /NETWORK ATTEMPT/,
    );
  });

  it('patched at least one native networking module', () => {
    // Not a fixed list: which modules exist varies by RN version. What must not
    // happen is patching none of them and reporting success.
    expect((saved['patchedModules'] as string[]).length).toBeGreaterThan(0);
  });
});

describe('the notice-data path over the whole corpus', () => {
  const records = corpusRecords();

  it('has a corpus to run over', () => {
    // Guards the failure where the OCR cache moved and this suite quietly
    // asserted nothing over zero records.
    expect(records.length).toBeGreaterThanOrEqual(70);
  });

  it('extracts every corpus record without touching the network', () => {
    for (const record of records) {
      const result = extractNotice({
        lines: record.lines,
        text: record.lines.map((l) => l.text).join('\n'),
        width: record.ocrWidth,
        height: record.ocrHeight,
        nowMs: CLOCK,
      });

      // Exercise what the app does with the result, not just the call itself.
      fieldNeedingAttention(result.fields);
      for (const key of FIELD_ORDER) effectiveRisk(key, result.fields[key]);
    }
    expect(attempts).toEqual([]);
  });

  it('checks orientation on every record without touching the network', () => {
    for (const record of records) {
      const check = checkOrientation(record.lines);
      shouldWarnUpsideDown(check);
    }
    expect(attempts).toEqual([]);
  });

  it('computes countdowns and the reminder ladder without touching the network', () => {
    const actions: ActionType[] = [
      'approval', 'denial', 'reduction', 'discontinuance', 'info_request', 'recert_due',
    ];
    for (const actionType of actions) {
      for (const iso of ['2026-08-24', '2026-08-26', '2026-09-05', '2026-12-31', '2020-01-01']) {
        const ms = isoToLocalMs(iso);
        if (ms === undefined) continue;
        const dates = { actionType, deadlineDate: ms, aidPaidPendingDeadline: ms };
        countdownDate(dates);
        countdownTier(dates, CLOCK);
        isUrgent(dates, CLOCK);
        remindersFor(dates, CLOCK);
        localMsToIso(ms);
      }
    }
    expect(attempts).toEqual([]);
  });

  it('loads and validates every bundled content pack without fetching it', () => {
    // The point of bundling content instead of serving it (CLAUDE.md §3 rule 4).
    const read = (name: string): unknown =>
      JSON.parse(readFileSync(join(REPO_ROOT, 'content', name), 'utf8'));
    parseCrossReferences(read('cross_reference.json'));
    parseOffices(read('offices.json'));
    parseDocTypes(read('doc_types.json'));
    expect(attempts).toEqual([]);
  });

  it('builds an explanation prompt and checks a result without inference over the wire', () => {
    // The model is local. Building the prompt and running the sanity pass must
    // not reach for a hosted endpoint (CLAUDE.md §3 rule 2).
    for (const record of records.slice(0, 10)) {
      const turns = buildExplanationTurns({
        program: 'CalFresh',
        office: 'Santa Clara County',
        actionType: 'recert_due',
        deadline: 'Saturday, September 5, 2026',
        noticeText: record.lines.map((l) => l.text).join('\n'),
      });
      expect(turns.length).toBeGreaterThan(0);
    }
    parseSections('SAYS: a.\nDO: b.\nAPPEAL: c.');
    checkExplanation('Send it by September 5, 2026.', ['Saturday, September 5, 2026']);
    expect(attempts).toEqual([]);
  });

  it('computes checklist progress without touching the network', () => {
    progressOf([
      { id: 'a', noticeId: 'n', origin: 'letter', state: 'attached', position: 0 },
      { id: 'b', noticeId: 'n', origin: 'user', state: 'needed', position: 1 },
    ]);
    expect(attempts).toEqual([]);
  });
});

/**
 * The static half.
 *
 * The runtime half only proves the lines it executed are clean. This reads the
 * bytes of every module in the notice-data path and fails on any reference to a
 * networking API, which covers the branches a test run does not happen to take.
 */
describe('no module in the notice-data path names a networking API', () => {
  /**
   * Directories the pipeline is built from. `src/lib/llm/model.ts` is the one
   * documented exception in the whole app — the user-initiated, wifi-gated
   * model download — and it is excluded BY NAME so that adding a second
   * exception is a visible edit to this list rather than a silent one.
   */
  const ROOTS = [
    'src/extraction',
    'src/lib/capture',
    'src/lib/content',
    'src/lib/db',
    'src/lib/extraction-port',
    'src/lib/ocr',
    'src/lib/notifications',
    'src/lib/diagnostics',
    'src/lib/urgency.ts',
    'src/lib/dates.ts',
    'src/lib/checklist.ts',
    'src/lib/llm/explain.ts',
    'src/lib/llm/explain-check.ts',
    'src/lib/llm/explain-grammar.ts',
  ];

  const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
    { pattern: /\bfetch\s*\(/, what: 'fetch()' },
    { pattern: /\bXMLHttpRequest\b/, what: 'XMLHttpRequest' },
    { pattern: /\bWebSocket\b/, what: 'WebSocket' },
    { pattern: /\bsendBeacon\b/, what: 'navigator.sendBeacon' },
    { pattern: /\bdownloadFileAsync\b/, what: 'File.downloadFileAsync' },
    { pattern: /\bdownloadResumable\b/, what: 'downloadResumable' },
    { pattern: /from\s+['"]axios['"]/, what: 'axios' },
    // A host character is required after the slashes. Without it this fired on
    // `raw.startsWith('https://')` in content/validate.ts — which is the code
    // that *validates* a provenance URL, not code that opens one. A rule that
    // cries wolf on its own enforcement gets deleted, so it has to be precise.
    { pattern: /https?:\/\/[A-Za-z0-9](?!.{0,2}['"`)])/, what: 'a hard-coded URL' },
  ];

  function filesUnder(relative: string): string[] {
    const absolute = join(REPO_ROOT, relative);
    if (relative.endsWith('.ts')) return [absolute];
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(path);
      }
    };
    walk(absolute);
    return out;
  }

  const files = ROOTS.flatMap(filesUnder);

  it('found the modules to check', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files.map((f) => [f.replace(`${REPO_ROOT}/`, ''), f]))('%s', (_name, path) => {
    const source = readFileSync(path as string, 'utf8');
    // Comments are where this rule is explained, so they must not trip it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const found = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map((f) => f.what);
    expect(found).toEqual([]);
  });
});
