/**
 * The Checklist's rules, tested where they can be tested without a phone.
 *
 * AUTHORSHIP: Claude. App-side code under test.
 *
 * `progressOf` is pure precisely so these can be bare-Node tests: the readiness
 * rule is the highest-stakes thing on that screen and it should not need a
 * simulator to hold. The doc-type pack is checked here too, because the rule it
 * carries — that it is a vocabulary and never a statement about what a
 * programme requires — is enforceable by reading the file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { letterDocTypes, progressOf } from '../../src/lib/checklist.ts';
import type { Requirement } from '../../src/lib/checklist.ts';
import { parseDocTypes } from '../../src/lib/content/parse.ts';
import { DOC_LEXICON } from '../../src/extraction/identity.ts';
import { REPO_ROOT } from '../../tools/metrics/corpus.ts';

function req(state: Requirement['state'], origin: Requirement['origin'] = 'letter'): Requirement {
  return { id: 'r', noticeId: 'n', origin, state, position: 0 };
}

describe('checklist progress', () => {
  it('counts attached and not-applicable as resolved', () => {
    const progress = progressOf([req('attached'), req('not_applicable'), req('needed')]);
    expect(progress.total).toBe(3);
    expect(progress.attached).toBe(1);
    expect(progress.notApplicable).toBe(1);
    expect(progress.resolved).toBe(2);
  });

  it('is ready only when every row is resolved', () => {
    expect(progressOf([req('attached'), req('not_applicable')]).ready).toBe(true);
    expect(progressOf([req('attached'), req('needed')]).ready).toBe(false);
  });

  /**
   * The one that matters most. Zero of zero is arithmetically complete and is
   * NOT readiness: an empty checklist means Carta does not know what the letter
   * asks for. Telling someone they are ready to send a packet on that basis is
   * the worst thing this screen could do, and it is exactly what a naive
   * `resolved === total` would do.
   */
  it('is never ready when the checklist is empty', () => {
    const progress = progressOf([]);
    expect(progress.total).toBe(0);
    expect(progress.resolved).toBe(0);
    expect(progress.ready).toBe(false);
  });

  it('does not count a not-applicable row as attached', () => {
    // Marking something as not applying must not make it look gathered — the
    // two are different facts and the UI renders them differently.
    const progress = progressOf([req('not_applicable')]);
    expect(progress.attached).toBe(0);
    expect(progress.ready).toBe(true);
  });
});

describe('the document vocabulary', () => {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8'),
  ) as unknown;

  it('parses, with both languages on every entry', () => {
    const pack = parseDocTypes(raw);
    expect(pack.all.length).toBeGreaterThan(5);
    for (const type of pack.all) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.labelEs.length).toBeGreaterThan(0);
      expect(type.what.length).toBeGreaterThan(0);
      expect(type.whatEs.length).toBeGreaterThan(0);
    }
  });

  it('rejects a duplicate id rather than silently dropping one', () => {
    const doubled = {
      doc_types: [
        { id: 'pay_stub', label: 'a', label_es: 'a', what: 'a', what_es: 'a' },
        { id: 'pay_stub', label: 'b', label_es: 'b', what: 'b', what_es: 'b' },
      ],
    };
    expect(() => parseDocTypes(doubled)).toThrow(/duplicate id/);
  });

  it('rejects an entry missing its Spanish', () => {
    const englishOnly = {
      doc_types: [{ id: 'x', label: 'a', what: 'a', what_es: 'a' }],
    };
    expect(() => parseDocTypes(englishOnly)).toThrow(/label_es/);
  });

  /**
   * CLAUDE.md §16. The file is a list of nouns; the moment it grows a key that
   * maps a programme or an action type to a set of documents, it has stopped
   * being a vocabulary and started asserting a rule about what a programme
   * requires — which Carta has no source for and must not invent.
   */
  it('says nothing about which programme requires what', () => {
    const text = readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed).filter((k) => !k.startsWith('_'))).toEqual(['doc_types']);

    const forbidden = /"(?:program|programs|action_type|required_for|required_by|applies_to)"\s*:/;
    expect(forbidden.test(text)).toBe(false);
  });

  it('carries the reminder that it is not a rule', () => {
    const parsed = JSON.parse(
      readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(String(parsed['_not_a_rule'])).toMatch(/NOT REQUIREMENTS/);
  });
});

/**
 * Found 2026-10-06 by a review of the web version, which vendors this code.
 * The cascade emitted `lease_or_rent_receipt` and `proof_of_residency`, neither
 * of which the vocabulary had, so the Checklist printed the raw id where a label
 * belonged, and a rent receipt filed from the picker (`rent_receipt`) never
 * matched the letter's row. No test compared the two lists.
 */
describe('what the letter asks for, against the vocabulary', () => {
  const pack = parseDocTypes(
    JSON.parse(readFileSync(join(REPO_ROOT, 'content/doc_types.json'), 'utf8')) as unknown,
  );

  it.each(DOC_LEXICON.map(([, id]) => id))('has a label for "%s"', (id) => {
    expect(pack.byId.get(id)?.label).toBeDefined();
  });

  it('stores a rent receipt under the id the picker uses', () => {
    expect(letterDocTypes(['lease_or_rent_receipt', 'pay_stub'], pack.byId)).toEqual([
      'rent_receipt',
      'pay_stub',
    ]);
  });

  it('labels a row saved under the old id', () => {
    // Saved before this fix; the alias keeps it readable.
    expect(pack.byId.get('lease_or_rent_receipt')?.label).toBe('Rent receipt or lease');
  });

  it('offers each document once in the picker', () => {
    const ids = pack.all.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('lease_or_rent_receipt');
  });

  it('keeps an id it has no label for, rather than dropping it', () => {
    expect(letterDocTypes(['not_in_the_list'], pack.byId)).toEqual(['not_in_the_list']);
  });

  it('does not list one document twice when the letter names it two ways', () => {
    expect(letterDocTypes(['rent_receipt', 'lease_or_rent_receipt'], pack.byId)).toEqual([
      'rent_receipt',
    ]);
  });

  it('rejects an alias that is already some other id', () => {
    const shadowing = {
      doc_types: [
        { id: 'pay_stub', label: 'a', label_es: 'a', what: 'a', what_es: 'a' },
        {
          id: 'rent_receipt',
          aliases: ['pay_stub'],
          label: 'b',
          label_es: 'b',
          what: 'b',
          what_es: 'b',
        },
      ],
    };
    expect(() => parseDocTypes(shadowing)).toThrow(/duplicate id "pay_stub"/);
  });
});
