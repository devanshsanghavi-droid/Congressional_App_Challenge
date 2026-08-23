/**
 * Content pack parsing and validation — pure.
 *
 * AUTHORSHIP: Claude. App-side code (CLAUDE.md §7).
 *
 * Static JSON, bundled, never fetched — SPEC §10 forbids content-update-over-
 * the-air infrastructure, and hard constraint 4 says that if a task seems to
 * need a server, bundle static JSON instead. This is that.
 *
 * **The raw JSON arrives as an argument.** This file imports nothing from disk
 * and nothing from the bundler, for the same reason the extraction island takes
 * its OCR text as a parameter: the app gets the data from Metro's JSON import,
 * the Node-side ship gate reads it with `fs`, and Node ESM and Metro disagree
 * about how a JSON import is spelled (`with { type: 'json' }` versus not). One
 * parameter removes the disagreement instead of picking a side.
 *
 * Everything is validated on parse. A malformed or unsourced entry throws
 * rather than rendering, and `tests/node/content.test.ts` runs it over the real
 * files on every `npm test`.
 */

import type {
  AppealsInfo,
  CrossReferenceEntry,
  CrossReferencePack,
  OfficeLocation,
  OfficesPack,
  OutstandingVerification,
  PhoneNumber,
  PublicChargeNote,
} from './types.ts';
import {
  ContentError,
  optionalString,
  requireConfidence,
  requireIsoDate,
  requirePopulationLevelPhrasing,
  requireSourceUrl,
  requireString,
} from './validate.ts';

type Json = Record<string, unknown>;

function obj(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContentError(where, 'expected an object');
  }
  return value as Json;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new ContentError(where, 'expected an array');
  return value;
}

// ------------------------------------------------------------ cross-references

function parseCrossReferenceEntry(raw: Json, where: string): CrossReferenceEntry {
  const id = requireString(raw['id'], `${where}.id`);
  const name = requireString(raw['name'], `${where}.name`);
  const what = requirePopulationLevelPhrasing(
    requireString(raw['what'], `${where}.what`),
    `${where}.what`,
  );
  const applyUrl = optionalString(raw['apply_url'], `${where}.apply_url`);
  const todoVerify = optionalString(raw['TODO_verify'], `${where}.TODO_verify`);

  if (typeof raw['categorical_eligibility'] !== 'boolean') {
    throw new ContentError(`${where}.categorical_eligibility`, 'must be true or false');
  }

  return {
    id,
    name,
    what,
    categoricalEligibility: raw['categorical_eligibility'],
    basis: requireString(raw['basis'], `${where}.basis`),
    sourceUrl: requireSourceUrl(raw['source_url'], `${where}.source_url`),
    verifiedOn: requireIsoDate(raw['verified_on'], `${where}.verified_on`),
    confidence: requireConfidence(raw['confidence'], `${where}.confidence`),
    ...(applyUrl === undefined ? {} : { applyUrl }),
    ...(todoVerify === undefined ? {} : { todoVerify }),
  };
}

/**
 * Resolve the pack.
 *
 * Entries may be written as `{"$ref": "<id or programme>"}` so a programme that
 * appears under several sources is stored once. A `$ref` naming a programme
 * pulls in that programme's whole list; one naming an entry id pulls in that
 * entry. An unresolvable ref throws — a silently dropped cross-reference is a
 * screen that quietly shows less than it should.
 */
export function parseCrossReferences(raw: unknown): CrossReferencePack {
  const root = obj(raw, 'cross_reference.json');
  const rawByProgram = obj(root['cross_references'], 'cross_references');

  // First pass: everything with a literal id, so refs have something to hit.
  const byId = new Map<string, CrossReferenceEntry>();
  for (const [program, entries] of Object.entries(rawByProgram)) {
    arr(entries, `cross_references.${program}`).forEach((entry, i) => {
      const record = obj(entry, `cross_references.${program}[${i}]`);
      if (record['$ref'] !== undefined) return;
      const parsed = parseCrossReferenceEntry(record, `cross_references.${program}[${i}]`);
      byId.set(parsed.id, parsed);
    });
  }

  const byProgram = new Map<string, CrossReferenceEntry[]>();
  for (const [program, entries] of Object.entries(rawByProgram)) {
    const resolved: CrossReferenceEntry[] = [];
    arr(entries, `cross_references.${program}`).forEach((entry, i) => {
      const where = `cross_references.${program}[${i}]`;
      const record = obj(entry, where);
      const ref = record['$ref'];
      if (ref === undefined) {
        resolved.push(parseCrossReferenceEntry(record, where));
        return;
      }
      const target = requireString(ref, `${where}.$ref`);
      const single = byId.get(target);
      if (single) {
        resolved.push(single);
        return;
      }
      const wholeProgram = rawByProgram[target];
      if (wholeProgram === undefined) {
        throw new ContentError(where, `$ref "${target}" matches no entry id and no programme`);
      }
      for (const inner of arr(wholeProgram, `cross_references.${target}`)) {
        const innerRecord = obj(inner, `cross_references.${target}`);
        if (innerRecord['$ref'] !== undefined) continue;
        resolved.push(parseCrossReferenceEntry(innerRecord, `cross_references.${target}`));
      }
    });

    // A programme listing the same entry twice would render a duplicate card.
    const seen = new Set<string>();
    byProgram.set(
      program,
      resolved.filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true))),
    );
  }

  const noteRaw = obj(root['public_charge_note'], 'public_charge_note');
  const noteTodo = optionalString(noteRaw['TODO_verify'], 'public_charge_note.TODO_verify');
  const publicChargeNote: PublicChargeNote = {
    en: requireString(noteRaw['en'], 'public_charge_note.en'),
    es: requireString(noteRaw['es'], 'public_charge_note.es'),
    sourceUrl: requireSourceUrl(noteRaw['source_url'], 'public_charge_note.source_url'),
    verifiedOn: requireIsoDate(noteRaw['verified_on'], 'public_charge_note.verified_on'),
    confidence: requireConfidence(noteRaw['confidence'], 'public_charge_note.confidence'),
    ...(noteTodo === undefined ? {} : { todoVerify: noteTodo }),
  };

  return {
    counties: arr(root['counties'], 'counties').map((c, i) => requireString(c, `counties[${i}]`)),
    byProgram,
    publicChargeNote,
    disclaimer: requireString(root['_disclaimer_required'], '_disclaimer_required'),
  };
}

// -------------------------------------------------------------------- offices

function parseLocation(
  raw: Json,
  where: string,
  inherited: { hours?: string; confirmHoursNote: string; verifiedOn: string; confidence: string },
): OfficeLocation {
  const purpose = optionalString(raw['purpose'], `${where}.purpose`);
  const hours = optionalString(raw['hours'], `${where}.hours`) ?? inherited.hours;
  return {
    id: requireString(raw['id'], `${where}.id`),
    name: requireString(raw['name'], `${where}.name`),
    address: requireString(raw['address'], `${where}.address`),
    city: requireString(raw['city'], `${where}.city`),
    state: requireString(raw['state'], `${where}.state`),
    zip: requireString(raw['zip'], `${where}.zip`),
    ...(purpose === undefined ? {} : { purpose }),
    ...(typeof raw['walk_in'] === 'boolean' ? { walkIn: raw['walk_in'] } : {}),
    ...(hours === undefined ? {} : { hours }),
    confirmHoursNote: inherited.confirmHoursNote,
    verifiedOn: requireIsoDate(inherited.verifiedOn, `${where}.verified_on`),
    confidence: requireConfidence(inherited.confidence, `${where}.confidence`),
  };
}

/**
 * The line every office must carry.
 *
 * It is attached here, to every location, rather than left to each screen —
 * `OfficeLocation.confirmHoursNote` is required by the type, so there is no way
 * to render an office without it. Hours change; a wasted trip across the county
 * is a real harm for someone with no car and two jobs.
 */
export const CONFIRM_HOURS_NOTE = 'Call to confirm hours before you go.';

export function parseOffices(raw: unknown): OfficesPack {
  const root = obj(raw, 'offices.json');
  const county = obj(root['county_offices'], 'county_offices');
  const shared = obj(county['shared'], 'county_offices.shared');
  const ssa = obj(root['ssa_offices'], 'ssa_offices');
  const appealsRaw = obj(root['appeals'], 'appeals');
  const bring = obj(root['what_to_bring'], 'what_to_bring');

  const countyInherited = {
    ...(typeof shared['hours'] === 'string' ? { hours: shared['hours'] } : {}),
    confirmHoursNote: CONFIRM_HOURS_NOTE,
    verifiedOn: requireIsoDate(county['verified_on'], 'county_offices.verified_on'),
    confidence: requireString(county['confidence'], 'county_offices.confidence'),
  };
  const ssaInherited = {
    confirmHoursNote: CONFIRM_HOURS_NOTE,
    verifiedOn: requireIsoDate(ssa['verified_on'], 'ssa_offices.verified_on'),
    confidence: requireString(ssa['confidence'], 'ssa_offices.confidence'),
  };

  const appealsUnit = obj(appealsRaw['appeals_unit'], 'appeals.appeals_unit');
  const appealsTodo = optionalString(appealsRaw['TODO_verify'], 'appeals.TODO_verify');
  const appeals: AppealsInfo = {
    how: requireString(appealsRaw['how'], 'appeals.how'),
    appealsUnit: {
      name: requireString(appealsUnit['name'], 'appeals.appeals_unit.name'),
      address: requireString(appealsUnit['address'], 'appeals.appeals_unit.address'),
      city: requireString(appealsUnit['city'], 'appeals.appeals_unit.city'),
      state: requireString(appealsUnit['state'], 'appeals.appeals_unit.state'),
      zip: requireString(appealsUnit['zip'], 'appeals.appeals_unit.zip'),
    },
    stateHearingsPhone: requireString(appealsRaw['state_hearings_phone'], 'appeals.state_hearings_phone'),
    stateHearingsTdd: requireString(appealsRaw['state_hearings_tdd'], 'appeals.state_hearings_tdd'),
    ombudsNote: requireString(appealsRaw['ombuds_note'], 'appeals.ombuds_note'),
    sourceUrl: requireSourceUrl(appealsRaw['source_url'], 'appeals.source_url'),
    verifiedOn: requireIsoDate(appealsRaw['verified_on'], 'appeals.verified_on'),
    confidence: requireConfidence(appealsRaw['confidence'], 'appeals.confidence'),
    ...(appealsTodo === undefined ? {} : { todoVerify: appealsTodo }),
  };

  const dropBoxNote = optionalString(shared['drop_box_note'], 'county_offices.shared.drop_box_note');

  return {
    countyAgency: requireString(county['agency'], 'county_offices.agency'),
    countyLocations: arr(county['locations'], 'county_offices.locations').map((l, i) =>
      parseLocation(obj(l, `county_offices.locations[${i}]`), `county_offices.locations[${i}]`, countyInherited),
    ),
    countyPhones: arr(county['phones'], 'county_offices.phones').map((p, i): PhoneNumber => {
      const record = obj(p, `county_offices.phones[${i}]`);
      return {
        label: requireString(record['label'], `county_offices.phones[${i}].label`),
        number: requireString(record['number'], `county_offices.phones[${i}].number`),
      };
    }),
    phoneTip: requireString(county['phone_tip'], 'county_offices.phone_tip'),
    accessibilityLine: requireString(shared['accessibility_line'], 'county_offices.shared.accessibility_line'),
    accessibilityNote: requireString(shared['accessibility_note'], 'county_offices.shared.accessibility_note'),
    languages: arr(shared['languages'], 'county_offices.shared.languages').map((l, i) =>
      requireString(l, `county_offices.shared.languages[${i}]`),
    ),
    ...(dropBoxNote === undefined ? {} : { dropBoxNote }),
    ssaAgency: requireString(ssa['agency'], 'ssa_offices.agency'),
    ssaNationalPhone: requireString(ssa['national_phone'], 'ssa_offices.national_phone'),
    ssaLocations: arr(ssa['locations'], 'ssa_offices.locations').map((l, i) =>
      parseLocation(obj(l, `ssa_offices.locations[${i}]`), `ssa_offices.locations[${i}]`, ssaInherited),
    ),
    appeals,
    whatToBringAlways: arr(bring['always'], 'what_to_bring.always').map((s, i) =>
      requireString(s, `what_to_bring.always[${i}]`),
    ),
    whatToBringUsually: arr(bring['usually'], 'what_to_bring.usually').map((s, i) =>
      requireString(s, `what_to_bring.usually[${i}]`),
    ),
    stillNeeded: arr(root['_still_needed'], '_still_needed').map((s, i) =>
      requireString(s, `_still_needed[${i}]`),
    ),
  };
}

// ------------------------------------------------------------- the ship gate

/**
 * Everything a human still has to confirm before this can be submitted.
 *
 * Two categories, both blocking:
 *
 *   - anything carrying a `TODO_verify`, which is an explicit "not confirmed";
 *   - anything at `confidence: "medium"` or lower, which per the packs' own
 *     note means it came from a third-party aggregator and was never checked at
 *     the agency source.
 *
 * `tests/node/content.test.ts` pins the current list, so a *new* unverified
 * entry fails the build. It does not fail on the ones already known — those are
 * tracked here and in NOTES.md, and the gate is `npm run content:check`.
 */
export function outstandingVerifications(
  crossRefs: CrossReferencePack,
  offices: OfficesPack,
): OutstandingVerification[] {
  const out: OutstandingVerification[] = [];

  const consider = (where: string, item: { confidence: string; todoVerify?: string }): void => {
    if (item.todoVerify !== undefined) {
      out.push({ where, reason: item.todoVerify, confidence: item.confidence as never });
    } else if (item.confidence !== 'high') {
      out.push({
        where,
        reason: `confidence "${item.confidence}" — not confirmed at the agency source`,
        confidence: item.confidence as never,
      });
    }
  };

  // Keyed on the entry id, not on programme + id: an entry reached through a
  // $ref renders under several programmes but is one thing to go and verify.
  for (const [, entries] of crossRefs.byProgram) {
    for (const entry of entries) consider(`cross_reference: ${entry.id}`, entry);
  }
  consider('cross_reference: public charge note', crossRefs.publicChargeNote);
  consider('offices: appeals', offices.appeals);
  for (const office of offices.ssaLocations) consider(`offices: ssa / ${office.id}`, office);
  for (const office of offices.countyLocations) consider(`offices: county / ${office.id}`, office);

  // Deduplicate: an entry reached through a $ref appears under several programmes.
  const seen = new Set<string>();
  return out.filter((item) => (seen.has(item.where) ? false : (seen.add(item.where), true)));
}
