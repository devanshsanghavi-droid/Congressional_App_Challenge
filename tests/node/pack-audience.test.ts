/**
 * No developer note may reach a user through a content pack.
 *
 * AUTHORSHIP: Claude. App-side content under test.
 *
 * ---------------------------------------------------------------------------
 * THIS HAS HAPPENED TWICE
 * ---------------------------------------------------------------------------
 * A content pack mixes two audiences in one JSON file. Most keys are copy a
 * frightened person reads on a phone. Some are instructions to whoever
 * maintains the content. Nothing in the file marks which is which, so the two
 * are one careless `.map()` apart — and twice they met:
 *
 * **1. `_disclaimer_required`.** Its value was written as an instruction *about*
 * the string rather than the string: *"Every rendering must carry: 'This is
 * general information…'"*. The cross-reference section rendered the whole thing,
 * quotes and all, under a list of programmes.
 *
 * **2. `still_needed`.** A work list for whoever sources the office data. Where
 * to Go printed it verbatim, so a user looking for an office read:
 * *"Not yet researched -- add name, address, phone, hours, languages, and what
 * they actually help with."*
 *
 * Both were caught by looking at a screenshot. That is not a control — it is
 * luck, applied inconsistently, on whichever screens someone happened to open.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * **A string in a content pack is user-facing unless it is proven otherwise.**
 *
 * Proven otherwise means one of exactly two things:
 *
 *   - the key begins with `_`, the packs' existing convention for metadata; or
 *   - the key is named in `MAINTAINER_KEYS` below — an explicit, short,
 *     reviewable list of the non-underscore keys that address a maintainer.
 *
 * Everything else is scanned for the vocabulary of a note-to-self. Adding a key
 * to `MAINTAINER_KEYS` is a deliberate act that shows up in a diff, and it
 * carries an obligation: that key must be surfaced by `npm run content:check`,
 * because a maintainer note nobody is shown is a maintainer note nobody acts on.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

const PACKS = ['cross_reference.json', 'offices.json', 'doc_types.json'];

/**
 * Non-underscore keys whose values address whoever maintains the content, not
 * the user. Short on purpose. Each one must also appear in `content:check`.
 */
const MAINTAINER_KEYS: readonly string[] = [
  // The office data that has not been sourced yet. Rendered to users on Where
  // to Go until 2026-08-24; now goes to the ship gate instead.
  'still_needed',
  // Per-entry "a human must confirm this before ship" notes, already surfaced.
  'TODO_verify',
];

/**
 * The vocabulary of a note written to a colleague.
 *
 * Tuned against the two real failures and the near-misses around them. It is
 * deliberately blunt: a false positive costs one rewritten sentence, and a
 * false negative puts "Not yet researched" in front of someone trying to find
 * an office before it closes.
 */
const DEVELOPER_NOTE: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bTODO\b/i, what: 'TODO' },
  { pattern: /\bFIXME\b|\bXXX\b|\bHACK\b/i, what: 'FIXME/XXX/HACK' },
  { pattern: /\bnot yet\b/i, what: '"not yet"' },
  { pattern: /\bnot researched\b|\bresearched\b/i, what: '"researched"' },
  { pattern: /\badd (?:name|address|phone|hours|languages)\b/i, what: '"add name/address/…"' },
  { pattern: /\bconfirm (?:all|the|this|that|current)\b/i, what: '"confirm all/the/this…"' },
  { pattern: /\bverify\b|\bunverified\b/i, what: '"verify"' },
  { pattern: /\bbefore (?:this )?ship(?:s|ping|ped)?\b/i, what: '"before this ships"' },
  { pattern: /\bplaceholder\b|\blorem ipsum\b/i, what: '"placeholder"' },
  { pattern: /\bmust be (?:checked|confirmed|replaced)\b/i, what: '"must be checked"' },
  { pattern: /\bwe (?:should|need to|must)\b/i, what: 'first-person-plural instruction' },
  // "Every rendering must carry: '…'" — an instruction ABOUT a string, in the
  // slot where the string belongs. Exactly failure (1).
  { pattern: /\b(?:every|each) rendering\b/i, what: 'an instruction about how to render' },
  { pattern: /\brenders? inline\b|\bnever behind a link\b/i, what: 'a rendering instruction' },
  { pattern: /\bsee (?:CLAUDE\.md|SPEC|NOTES)\b/i, what: 'a reference to project docs' },
  { pattern: /\bsection \d+\b|\b§\d+\b/i, what: 'a spec section reference' },
  { pattern: /\bmanual browser step\b|\bblocks (?:agent|automated)\b/i, what: 'tooling notes' },
];

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface Finding {
  readonly pack: string;
  readonly path: string;
  readonly matched: string;
  readonly text: string;
}

/**
 * Walk a pack, yielding every string a user could see.
 *
 * Skips any key starting with `_` and anything under a `MAINTAINER_KEYS` key,
 * including nested values — a maintainer note is still a maintainer note when
 * it is inside an array.
 */
function userFacingStrings(node: Json, path: string, out: { path: string; text: string }[]): void {
  if (typeof node === 'string') {
    out.push({ path, text: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => userFacingStrings(child, `${path}[${i}]`, out));
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('_')) continue;
      if (MAINTAINER_KEYS.includes(key)) continue;
      // A URL is structure, not prose. `source_url` pointing at cdss.ca.gov is
      // the provenance mechanism working, and scanning it for English idiom
      // finds only noise.
      if (key.endsWith('_url')) continue;
      userFacingStrings(value, path === '' ? key : `${path}.${key}`, out);
    }
  }
}

function auditPack(pack: string): Finding[] {
  const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'content', pack), 'utf8')) as Json;
  const strings: { path: string; text: string }[] = [];
  userFacingStrings(raw, '', strings);

  const findings: Finding[] = [];
  for (const { path, text } of strings) {
    for (const { pattern, what } of DEVELOPER_NOTE) {
      if (pattern.test(text)) {
        findings.push({ pack, path, matched: what, text: text.slice(0, 120) });
      }
    }
  }
  return findings;
}

describe('content packs do not address a developer where a user will read', () => {
  it.each(PACKS)('%s', (pack) => {
    const findings = auditPack(pack);
    // Reported with the path and the offending text, so a failure says which
    // string to move rather than that a count changed.
    expect(findings).toEqual([]);
  });

  it('has real strings to audit, so a passing run means something', () => {
    // Guards the failure where the walker silently yields nothing — which would
    // make every assertion above vacuous.
    const total = PACKS.reduce((n, pack) => {
      const raw = JSON.parse(readFileSync(join(REPO_ROOT, 'content', pack), 'utf8')) as Json;
      const strings: { path: string; text: string }[] = [];
      userFacingStrings(raw, '', strings);
      return n + strings.length;
    }, 0);
    expect(total).toBeGreaterThan(100);
  });
});

describe('the audit can actually fire', () => {
  /**
   * A filter that matches nothing fails silently and looks exactly like
   * success — the lesson from the `XXX` check, where two patterns never fired
   * because `\b` before `#` asserts the opposite of what it looks like. So
   * every pattern is proven to catch something.
   */
  it.each(DEVELOPER_NOTE.map((d) => [d.what, d.pattern] as const))(
    'the %s pattern matches its own example',
    (_what, pattern) => {
      const samples = [
        'TODO: check this',
        'FIXME later',
        'This is XXX broken',
        'HACK around it',
        'Not yet researched',
        'not researched at the agency',
        'add name, address, phone, hours, languages',
        'Confirm all three SSA addresses',
        'verify this before shipping',
        'unverified',
        'Check this before this ships',
        'placeholder text',
        'lorem ipsum',
        'must be checked at the source',
        'we should confirm this',
        'Every rendering must carry this',
        'renders inline with the list',
        'never behind a link',
        'see CLAUDE.md for why',
        'SPEC section 10 forbids it',
        'cdss.ca.gov blocks agent traffic',
        'blocks automated requests',
        'this is a manual browser step',
      ];
      expect(samples.some((s) => pattern.test(s))).toBe(true);
    },
  );

  it('catches the exact string that reached a user on Where to Go', () => {
    // Verbatim from `offices.json`'s `still_needed`, which Where to Go printed.
    const real =
      '2-3 community organizations that help with benefit applications ' +
      '(Sacred Heart Community Service, Second Harvest of Silicon Valley). ' +
      'Not yet researched -- add name, address, phone, hours, languages, and ' +
      'what they actually help with.';
    expect(DEVELOPER_NOTE.some(({ pattern }) => pattern.test(real))).toBe(true);
  });

  it('catches the exact string that reached a user on Notice Detail', () => {
    // Verbatim from the old `_disclaimer_required`, rendered with its own
    // instruction attached.
    const real =
      "Every rendering must carry: 'This is general information, not a " +
      "determination about your household. Contact the program to find out if " +
      "you qualify.'";
    expect(DEVELOPER_NOTE.some(({ pattern }) => pattern.test(real))).toBe(true);
  });

  it('does not fire on ordinary user copy', () => {
    // The rule is worth nothing if it makes writing plain copy painful.
    const fine = [
      'Free breakfast and lunch at school.',
      'Call to confirm hours before you go.',
      'You can walk in.',
      'Discounted home phone or cell phone service.',
      'A gas, electric, water, or phone bill.',
      'Most offices want pay stubs from the last 30 days.',
      'This is general information, not a determination about your household.',
      'Talón de pago',
      'Comprobante de lo que se paga por la vivienda, y a quién.',
    ];
    for (const text of fine) {
      const hit = DEVELOPER_NOTE.find(({ pattern }) => pattern.test(text));
      expect(hit ? `${text} matched ${hit.what}` : null).toBeNull();
    }
  });
});

describe('every maintainer key is surfaced somewhere a maintainer looks', () => {
  /**
   * The obligation that comes with the exemption. A key excused from the audit
   * because "it is for a maintainer" must actually reach one — otherwise the
   * exemption is just a way to hide a note from everybody.
   */
  it('names each exempt key in the ship gate', () => {
    const gate = readFileSync(join(REPO_ROOT, 'src/lib/content/parse.ts'), 'utf8');
    const outstanding = gate.slice(gate.indexOf('export function outstandingVerifications'));
    for (const key of MAINTAINER_KEYS) {
      // `still_needed` -> `stillNeeded`, `TODO_verify` -> `todoVerify`.
      const camel = key
        .toLowerCase()
        .replace(/_(.)/g, (_, c: string) => c.toUpperCase());
      expect(outstanding.includes(camel)).toBe(true);
    }
  });
});
