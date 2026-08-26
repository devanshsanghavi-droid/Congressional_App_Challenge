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
  parseDocTypes,
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
const loadDocTypes = (): ReturnType<typeof parseDocTypes> => parseDocTypes(read('doc_types.json'));
const outstanding = (): ReturnType<typeof outstandingVerifications> =>
  outstandingVerifications(loadCrossReferences(), loadOffices(), loadDocTypes());

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
    // Added 2026-08-24 with the Spanish cross-reference copy. The what_es
    // strings were written for Carta, not taken from an agency translation —
    // these programmes are not CDSS forms, so CLAUDE.md §9's "use CDSS's own
    // wording" has nothing to point at. A fluent speaker has to read them.
    // Added 2026-08-24. This one had never been counted: `outstandingVerifications`
    // was not given the doc-types pack at all, so the ship gate reported a number
    // lower than the truth for as long as the pack existed.
    'doc_types: Spanish labels and descriptions',
    'cross_reference: ihss',
    'cross_reference: liheap',
    'cross_reference: public charge note',
    'cross_reference: school-meals',
    'cross_reference: subsidized-childcare',
    // CLOSED 2026-08-26: `cross_reference: Spanish descriptions (what_es)` was
    // here. A fluent speaker read every what_es string and signed it off, which
    // is exactly what the item asked for — see `_translation_reviewed`.
    //
    // `doc_types: Spanish labels and descriptions` deliberately did NOT close on
    // the same review. That item is two things — is the Spanish good, and whose
    // words are they — and only the first is done. The state publishes this
    // vocabulary in SAR 7 (SP); Carta does not have the document yet. A
    // well-reviewed translation is still a translation.
    // CLOSED 2026-08-25: `offices: appeals` was here. The two appeal clocks are
    // now sourced to LSNC's CalFresh guide and asserted below by `describe('the
    // appeal windows')` — which is a stronger guard than being on this list was.
    //
    // REMOVED 2026-08-25: `offices: freshness / bank_statement` was here. It was
    // confidence:low and self-described as NOT SOURCED, and §16 does not permit a
    // low-confidence claim about what an agency requires. Cite it or delete it;
    // there was no citation, so it was deleted.
    //
    // Added 2026-08-24 with the Vault. A freshness rule is a claim about what an
    // agency requires, so it needs an agency source like an appeal window does.
    // `pay_stub` echoes the county's own "what to bring" wording.
    'offices: freshness / pay_stub',
    // Added 2026-08-24. `still_needed` is a work list for whoever sources the
    // content. It was being RENDERED to users on Where to Go — "Not yet
    // researched -- add name, address, phone" — until a device check caught it.
    // It belongs here, in front of the person it is addressed to.
    'offices: still needed',
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

  it('flags the highest-stakes remaining item by name', () => {
    // USCIS public charge copy. Getting it wrong frightens a family away from
    // food they are entitled to. The appeal window used to sit beside it here
    // and is now sourced — see the block below, which replaces this guard with
    // a stronger one rather than dropping it.
    const where = outstanding().map((o) => o.where);
    expect(where).toContain('cross_reference: public charge note');
  });
});

/**
 * The appeal windows — the highest-stakes numbers in Carta.
 *
 * Sourced 2026-08-25 to Legal Services of Northern California's CalFresh guide,
 * "Continuing benefits while waiting for a fair hearing". Deliberately marked
 * `confidence: medium` and `source_kind: legal aid guide, not regulation`: a
 * secondary source read carefully is honest, and dressing it up as a citation to
 * the regs would not be.
 *
 * **There are two clocks and they are not the same clock.** Ten days keeps
 * benefits running at the current amount until an ALJ decides. Ninety days is
 * how long the right to request a hearing lasts at all. Conflating them fails in
 * both directions: quote 90 to a household deciding whether to file this week
 * and they lose benefits during the appeal; quote 10 on day 11 and they believe
 * they have lost a right they still have.
 *
 * These tests exist because that is a single-word edit away at all times.
 */
describe('the appeal windows', () => {
  const windows = () =>
    (read('offices.json') as { appeals: { windows: Record<string, { days?: number; en?: string }> } })
      .appeals.windows;

  it('keeps continuing benefits at 10 days and the hearing right at 90', () => {
    expect(windows()['aid_paid_pending']?.days).toBe(10);
    expect(windows()['hearing_request']?.days).toBe(90);
  });

  it('never lets the two clocks collapse into one number', () => {
    expect(windows()['aid_paid_pending']?.days).not.toBe(windows()['hearing_request']?.days);
  });

  it("does not put the other clock's number in either explanation", () => {
    // The realistic failure is prose drift, not a changed integer: an edit that
    // says "90 days" inside the sentence about keeping benefits.
    expect(windows()['aid_paid_pending']?.en).toContain('10 days');
    expect(windows()['aid_paid_pending']?.en).not.toContain('90');
    expect(windows()['hearing_request']?.en).toContain('90 days');
    expect(windows()['hearing_request']?.en).not.toContain('10 days');
  });

  it('carries its source, its kind, and the not-legal-advice line', () => {
    const w = (read('offices.json') as { appeals: { windows: Record<string, string> } })
      .appeals.windows;
    expect(w['source_url']).toContain('calfresh.guide');
    // Never quotable as regulation. CLAUDE.md §16.
    expect(w['source_kind']).toMatch(/not regulation/i);
    expect(w['confidence']).toBe('medium');
    expect(w['disclaimer_required']).toMatch(/not legal advice/i);
  });
});
