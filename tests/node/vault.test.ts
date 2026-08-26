/**
 * The Vault's rules, and the freshness data behind them.
 *
 * AUTHORSHIP: Claude. App-side code under test.
 *
 * `documentAge` and `groupDocuments` are pure and live in `src/lib/checklist.ts`
 * so these can run in bare Node. The rule worth this file is the one about
 * silence: **a document with no sourced freshness rule must get an age and no
 * judgement**, because the alternative — a default limit — turns "Carta has no
 * source for this" into a confident claim about every document type at once.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { documentAge, groupDocuments } from '../../src/lib/checklist.ts';
import { parseOffices } from '../../src/lib/content/parse.ts';
import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

/** A fixed clock. Local noon, so nothing here depends on the hour it is run. */
const NOW = new Date(2026, 7, 24, 12, 0, 0).getTime();
const DAY = 86_400_000;

function daysAgo(n: number): number {
  return new Date(2026, 7, 24 - n, 9, 0, 0).getTime();
}

describe('documentAge', () => {
  it('counts whole calendar days', () => {
    expect(documentAge(daysAgo(0), NOW).days).toBe(0);
    expect(documentAge(daysAgo(1), NOW).days).toBe(1);
    expect(documentAge(daysAgo(47), NOW).days).toBe(47);
  });

  it('is not fooled by the time of day', () => {
    // Saved at 23:59 yesterday, read at 00:01 today: one calendar day, not zero.
    const lateYesterday = new Date(2026, 7, 23, 23, 59).getTime();
    const earlyToday = new Date(2026, 7, 24, 0, 1).getTime();
    expect(documentAge(lateYesterday, earlyToday).days).toBe(1);
  });

  /**
   * The DST trap that already bit `daysUntil` in `urgency.ts`.
   *
   * Spring forward is the direction that breaks: the span loses an hour, so a
   * millisecond division gives 30.958 and `Math.floor` reports **30** for a
   * document saved 31 calendar days ago. Autumn is harmless — the extra hour
   * rounds the same way — which is exactly why testing only one direction would
   * have passed and shipped the bug.
   */
  it('is right across a spring-forward DST boundary', () => {
    const before = new Date(2026, 1, 15, 9, 0).getTime(); // 15 Feb
    const after = new Date(2026, 2, 18, 9, 0).getTime(); // 18 Mar, clocks moved
    expect(documentAge(before, after).days).toBe(31);
    // The naive version, for contrast. This is the number NOT to ship.
    expect(Math.floor((after - before) / DAY)).toBe(30);
  });

  it('never reports a negative age', () => {
    // A device clock moved backwards must not produce "saved -3 days ago".
    expect(documentAge(daysAgo(-3), NOW).days).toBe(0);
  });

  describe('staleness', () => {
    it('is stale only past the limit', () => {
      expect(documentAge(daysAgo(29), NOW, 30).stale).toBe(false);
      expect(documentAge(daysAgo(30), NOW, 30).stale).toBe(false);
      expect(documentAge(daysAgo(31), NOW, 30).stale).toBe(true);
      expect(documentAge(daysAgo(47), NOW, 30).stale).toBe(true);
    });

    /**
     * The rule this whole design exists for. No sourced limit means no opinion.
     * If this ever returns `true` for an absent limit, Carta has started
     * inventing a rule about what an agency requires (CLAUDE.md §16).
     */
    it('is never stale when there is no sourced rule', () => {
      for (const age of [0, 30, 400, 4000]) {
        expect(documentAge(daysAgo(age), NOW).stale).toBe(false);
      }
    });
  });
});

describe('groupDocuments', () => {
  const doc = (id: string, docType: string | undefined, ago: number) => ({
    id,
    capturedAt: daysAgo(ago),
    ...(docType === undefined ? {} : { docType }),
  });

  it('groups by type and sorts each group newest first', () => {
    const groups = groupDocuments([
      doc('a', 'pay_stub', 40),
      doc('b', 'utility_bill', 5),
      doc('c', 'pay_stub', 2),
    ]);
    expect(groups.map((g) => g.docType)).toEqual(['pay_stub', 'utility_bill']);
    expect(groups[0]?.documents.map((d) => d.id)).toEqual(['c', 'a']);
  });

  it('puts untyped documents last', () => {
    const groups = groupDocuments([
      doc('x', undefined, 1),
      doc('a', 'pay_stub', 10),
    ]);
    expect(groups.map((g) => g.docType)).toEqual(['pay_stub', undefined]);
  });

  it('keeps every document', () => {
    const input = [doc('a', 'pay_stub', 1), doc('b', undefined, 2), doc('c', 'pay_stub', 3)];
    const total = groupDocuments(input).reduce((n, g) => n + g.documents.length, 0);
    expect(total).toBe(input.length);
  });

  it('returns nothing for nothing', () => {
    expect(groupDocuments([])).toEqual([]);
  });
});

describe('the freshness rules in offices.json', () => {
  const pack = parseOffices(
    JSON.parse(readFileSync(join(REPO_ROOT, 'content/offices.json'), 'utf8')) as unknown,
  );

  it('sources every rule, like every other claim in the packs', () => {
    for (const [docType, rule] of pack.freshness) {
      expect(rule.sourceUrl.startsWith('https://')).toBe(true);
      expect(rule.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rule.days).toBeGreaterThan(0);
      // Both languages, required — an unwarned Spanish speaker is the failure.
      expect(rule.en.length).toBeGreaterThan(0);
      expect(rule.es.length).toBeGreaterThan(0);
      expect(docType).toBe(rule.docType);
    }
  });

  it('names a doc type that actually exists', () => {
    // A rule keyed on a typo would silently never fire.
    const types = JSON.parse(
      readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8'),
    ) as { doc_types: { id: string }[] };
    const ids = new Set(types.doc_types.map((d) => d.id));
    for (const docType of pack.freshness.keys()) {
      expect(ids.has(docType)).toBe(true);
    }
  });

  it('does not claim a rule for most document types', () => {
    // Deliberate. Carta has a source for one or two of these, not for twelve,
    // and the screen says "Carta does not know" for the rest.
    const types = JSON.parse(
      readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8'),
    ) as { doc_types: { id: string }[] };
    expect(pack.freshness.size).toBeLessThan(types.doc_types.length / 2);
  });
});
