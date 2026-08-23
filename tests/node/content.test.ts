/**
 * The bundled content packs, validated against the real files.
 *
 * AUTHORSHIP: Claude. Test harness.
 *
 * CLAUDE.md §16: never invent a form ID, a deadline rule, a regulation
 * citation, an appeal window, a programme eligibility rule, or an office's
 * hours. A JSON file is easy to edit and nothing stops a plausible-looking
 * unsourced entry being added, so the rule is enforced here rather than
 * remembered — these run over `content/*.json` on every `npm test`.
 *
 * The phrasing tests are the ones that matter most. SPEC §10 forbids
 * eligibility screening; §2.1 permits a cross-reference at population level
 * only. That is a one-word difference in copy and the whole difference between
 * a permitted feature and a forbidden one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONFIRM_HOURS_NOTE,
  outstandingVerifications,
  parseCrossReferences,
  parseOffices,
} from '../../src/lib/content/parse.ts';
import {
  ContentError,
  daysSinceVerified,
  isStale,
  requirePopulationLevelPhrasing,
  requireSourceUrl,
} from '../../src/lib/content/validate.ts';

// Read from disk rather than importing, so these tests exercise the same path
// the ship gate does and do not depend on how a bundler spells a JSON import.
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'content', name), 'utf8'));

const loadCrossReferences = (): ReturnType<typeof parseCrossReferences> =>
  parseCrossReferences(read('cross_reference.json'));
const loadOffices = (): ReturnType<typeof parseOffices> => parseOffices(read('offices.json'));
const outstanding = (): ReturnType<typeof outstandingVerifications> =>
  outstandingVerifications(loadCrossReferences(), loadOffices());

describe('content packs load and validate', () => {
  it('loads both packs without throwing', () => {
    expect(() => loadCrossReferences()).not.toThrow();
    expect(() => loadOffices()).not.toThrow();
  });

  it('resolves every $ref to a real entry', () => {
    // An unresolvable ref throws on load, so reaching here means they all
    // resolved. Assert the effect: every programme has at least one entry.
    const pack = loadCrossReferences();
    expect(pack.byProgram.size).toBeGreaterThan(0);
    for (const [program, entries] of pack.byProgram) {
      expect(entries.length).toBeGreaterThan(0);
      // A duplicate would render the same card twice on Notice Detail.
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(program).not.toBe('');
    }
  });

  it('sources and dates every cross-reference entry', () => {
    for (const [, entries] of loadCrossReferences().byProgram) {
      for (const entry of entries) {
        expect(entry.sourceUrl).toMatch(/^https:\/\//);
        expect(entry.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['high', 'medium', 'low']).toContain(entry.confidence);
        expect(entry.what.length).toBeGreaterThan(0);
        expect(entry.basis.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries the disclaimer and the public-charge note, both sourced', () => {
    const pack = loadCrossReferences();
    expect(pack.disclaimer).toContain('not a determination');
    // Renders inline with the list, never behind a link (CLAUDE.md §4), so it
    // has to exist in both languages before the section can render at all.
    expect(pack.publicChargeNote.en.length).toBeGreaterThan(0);
    expect(pack.publicChargeNote.es.length).toBeGreaterThan(0);
    expect(pack.publicChargeNote.sourceUrl).toContain('uscis.gov');
  });
});

describe('population-level phrasing is enforced, not trusted', () => {
  it('rejects individual eligibility phrasing in English', () => {
    for (const copy of [
      'You may qualify for WIC.',
      'You could be eligible for LIHEAP.',
      "You're eligible for school meals.",
      'Your household qualifies for Medi-Cal.',
    ]) {
      expect(() => requirePopulationLevelPhrasing(copy, 'test')).toThrow(ContentError);
    }
  });

  it('rejects individual eligibility phrasing in Spanish', () => {
    for (const copy of ['Usted califica para WIC.', 'Puede calificar para LIHEAP.']) {
      expect(() => requirePopulationLevelPhrasing(copy, 'test')).toThrow(ContentError);
    }
  });

  it('accepts population-level phrasing', () => {
    const copy = 'People receiving CalFresh are often also eligible for WIC.';
    expect(() => requirePopulationLevelPhrasing(copy, 'test')).not.toThrow();
  });

  it('holds across every shipped cross-reference string', () => {
    for (const [, entries] of loadCrossReferences().byProgram) {
      for (const entry of entries) {
        expect(() => requirePopulationLevelPhrasing(entry.what, entry.id)).not.toThrow();
        expect(() => requirePopulationLevelPhrasing(entry.name, entry.id)).not.toThrow();
      }
    }
  });
});

describe('offices', () => {
  const offices = loadOffices();

  it('attaches the confirm-hours line to every office', () => {
    // Required by the type, so this cannot regress silently — but assert it
    // anyway, because the harm it prevents is a wasted trip across the county
    // for someone with no car.
    const all = [...offices.countyLocations, ...offices.ssaLocations];
    expect(all.length).toBeGreaterThan(0);
    for (const office of all) {
      expect(office.confirmHoursNote).toBe(CONFIRM_HOURS_NOTE);
      expect(office.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('gives every office a complete postal address', () => {
    for (const office of [...offices.countyLocations, ...offices.ssaLocations]) {
      expect(office.address).not.toBe('');
      expect(office.city).not.toBe('');
      expect(office.state).toMatch(/^[A-Z]{2}$/);
      expect(office.zip).toMatch(/^\d{5}(-\d{4})?$/);
    }
  });

  it('has the appeals routing Notice Detail needs to be real rather than a stub', () => {
    // SPEC §7: Notice Detail's explanation ends with "How to appeal". Without
    // these it would be placeholder copy, which CLAUDE.md §10 forbids shipping.
    expect(offices.appeals.appealsUnit.address).toBe('353 W. Julian St.');
    expect(offices.appeals.stateHearingsPhone).toBe('+1-800-952-5253');
    expect(offices.appeals.stateHearingsTdd).toBe('+1-800-952-8349');
    expect(offices.appeals.how.length).toBeGreaterThan(0);
  });

  it('keeps every phone number in a diallable format', () => {
    const numbers = [
      ...offices.countyPhones.map((p) => p.number),
      offices.accessibilityLine,
      offices.ssaNationalPhone,
      offices.appeals.stateHearingsPhone,
      offices.appeals.stateHearingsTdd,
    ];
    for (const number of numbers) expect(number).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/);
  });
});

describe('verification staleness', () => {
  it('counts days from a supplied clock, not a global one', () => {
    const now = new Date(2026, 7, 20).getTime();
    expect(daysSinceVerified('2026-08-18', now)).toBe(2);
    expect(daysSinceVerified('2026-02-18', now)).toBe(183);
  });

  it('flags content older than six months', () => {
    const now = new Date(2026, 7, 20).getTime();
    expect(isStale('2026-08-18', now)).toBe(false);
    expect(isStale('2026-02-17', now)).toBe(true);
  });

  it('rejects a source url that is not https', () => {
    expect(() => requireSourceUrl('http://example.gov', 'test')).toThrow(ContentError);
    expect(() => requireSourceUrl('', 'test')).toThrow(ContentError);
  });
});

describe('the ship gate — what a human still has to confirm', () => {
  /**
   * Pinned so a NEW unverified entry fails the build. The entries listed here
   * are already known and tracked in NOTES.md; the test's job is to stop the
   * list growing silently, and to stop it shrinking by deletion rather than by
   * verification.
   */
  const KNOWN_OUTSTANDING = [
    'cross_reference: ihss',
    'cross_reference: liheap',
    'cross_reference: public charge note',
    'cross_reference: school-meals',
    'cross_reference: subsidized-childcare',
    'offices: appeals',
    'offices: ssa / ssa-cottle',
    'offices: ssa / ssa-downtown',
    'offices: ssa / ssa-fontaine',
  ];

  it('reports exactly the known outstanding items', () => {
    const found = outstanding().map((o) => o.where).sort();
    expect(found).toEqual([...KNOWN_OUTSTANDING].sort());
  });

  it('gives a reason for each, not just a flag', () => {
    for (const item of outstanding()) {
      expect(item.reason.length).toBeGreaterThan(20);
    }
  });

  it('flags the two highest-stakes items by name', () => {
    // USCIS public charge copy and the CDSS appeal window. Getting the first
    // wrong frightens a family away from food; getting the second wrong is the
    // difference between keeping benefits during an appeal and not.
    const where = outstanding().map((o) => o.where);
    expect(where).toContain('cross_reference: public charge note');
    expect(where).toContain('offices: appeals');
  });
});
