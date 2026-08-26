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
  DocType,
  DocTypesPack,
  DocumentFreshness,
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
  const whatEs = requirePopulationLevelPhrasing(
    requireString(raw['what_es'], `${where}.what_es`),
    `${where}.what_es`,
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
    whatEs,
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

  const translationTodo = optionalString(root['_translation_todo'], '_translation_todo');

  return {
    counties: arr(root['counties'], 'counties').map((c, i) => requireString(c, `counties[${i}]`)),
    byProgram,
    publicChargeNote,
    // NOT run through requirePopulationLevelPhrasing, and this is deliberate.
    // The disclaimer is the one string that has to say "find out if you
    // qualify" — its entire job is to tell the reader that Carta is not the one
    // deciding. It is exempt for the same reason `basis` is: the rule is about
    // copy that claims to know the reader's eligibility, and this claims the
    // opposite. Running the check here failed the build, which is the check
    // working correctly on a string it should never have been pointed at.
    disclaimer: requireString(root['_disclaimer_required'], '_disclaimer_required'),
    disclaimerEs: requireString(root['_disclaimer_required_es'], '_disclaimer_required_es'),
    ...(translationTodo === undefined ? {} : { translationTodo }),
  };
}

/**
 * Freshness rules, each fully sourced or not parsed at all.
 *
 * Absent is fine — the Vault shows an age and says nothing about it. What must
 * never happen is an entry without a citation, so `requireSourceUrl` and
 * `requireIsoDate` apply here exactly as they do to an appeal window.
 */
function parseFreshness(raw: unknown): ReadonlyMap<string, DocumentFreshness> {
  const out = new Map<string, DocumentFreshness>();
  if (raw === undefined || raw === null) return out;

  for (const [docType, value] of Object.entries(obj(raw, 'what_to_bring.freshness'))) {
    const where = `what_to_bring.freshness.${docType}`;
    const record = obj(value, where);
    const days = record['days'];
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
      throw new ContentError(`${where}.days`, 'must be a positive number of days');
    }
    const todoVerify = optionalString(record['TODO_verify'], `${where}.TODO_verify`);
    out.set(docType, {
      docType,
      days,
      en: requireString(record['en'], `${where}.en`),
      es: requireString(record['es'], `${where}.es`),
      sourceUrl: requireSourceUrl(record['source_url'], `${where}.source_url`),
      verifiedOn: requireIsoDate(record['verified_on'], `${where}.verified_on`),
      confidence: requireConfidence(record['confidence'], `${where}.confidence`),
      ...(todoVerify === undefined ? {} : { todoVerify }),
    });
  }
  return out;
}

// ------------------------------------------------------------------ doc types

/**
 * Parse the document vocabulary.
 *
 * Both languages are required for every entry, for the same reason
 * `CrossReferenceEntry.whatEs` is: an optional translation is one that quietly
 * does not exist by ship, and a Spanish speaker then reads an English checklist.
 */
export function parseDocTypes(raw: unknown): DocTypesPack {
  const root = obj(raw, 'doc_types.json');
  const all: DocType[] = arr(root['doc_types'], 'doc_types').map((entry, i) => {
    const where = `doc_types[${i}]`;
    const record = obj(entry, where);
    return {
      id: requireString(record['id'], `${where}.id`),
      label: requireString(record['label'], `${where}.label`),
      labelEs: requireString(record['label_es'], `${where}.label_es`),
      what: requireString(record['what'], `${where}.what`),
      whatEs: requireString(record['what_es'], `${where}.what_es`),
    };
  });

  const byId = new Map<string, DocType>();
  for (const type of all) {
    // A duplicate id would make `byId` silently drop one, and the Checklist
    // would render the wrong label for a requirement read off a letter.
    if (byId.has(type.id)) throw new ContentError('doc_types', `duplicate id "${type.id}"`);
    byId.set(type.id, type);
  }

  const translationTodo = optionalString(root['_translation_todo'], '_translation_todo');
  return { byId, all, ...(translationTodo === undefined ? {} : { translationTodo }) };
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
    freshness: parseFreshness(bring['freshness']),
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
  docTypes?: DocTypesPack,
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

  // The Spanish programme descriptions were written for Carta, not taken from an
  // official agency translation — these programmes are not CDSS forms, so the
  // CLAUDE.md §9 rule ("use CDSS's own wording where it exists") has nothing to
  // point at. Unreviewed Spanish shown to a Spanish speaker is exactly the kind
  // of thing that ships quietly, so it is named here rather than trusted.
  // The doc-type vocabulary's Spanish. Optional only so an older caller does
  // not break; it was genuinely MISSING from this function until 2026-08-24,
  // which meant `npm run content:check` had never counted it and reported a
  // number lower than the truth. An unverified translation that the ship gate
  // does not name is one that ships.
  if (docTypes?.translationTodo !== undefined) {
    out.push({
      where: 'doc_types: Spanish labels and descriptions',
      reason: docTypes.translationTodo,
      confidence: 'medium',
    });
  }

  if (crossRefs.translationTodo !== undefined) {
    out.push({
      where: 'cross_reference: Spanish descriptions (what_es)',
      reason: crossRefs.translationTodo,
      confidence: 'medium',
    });
  }
  consider('offices: appeals', offices.appeals);
  // A freshness rule is a claim about what an agency requires. It is the newest
  // and least-sourced thing in the packs, so it is named individually.
  for (const [docType, rule] of offices.freshness) {
    consider(`offices: freshness / ${docType}`, rule);
  }
  // `still_needed` is a work list for whoever sources the content. It belongs
  // here, in front of that person, and NOT on the Where to Go screen — where it
  // was rendered to users until 2026-08-24.
  for (const item of offices.stillNeeded) {
    out.push({
      where: 'offices: still needed',
      reason: item,
      confidence: 'low' as never,
    });
  }
  for (const office of offices.ssaLocations) consider(`offices: ssa / ${office.id}`, office);
  for (const office of offices.countyLocations) consider(`offices: county / ${office.id}`, office);

  // Deduplicate: an entry reached through a $ref appears under several programmes.
  const seen = new Set<string>();
  return out.filter((item) => (seen.has(item.where) ? false : (seen.add(item.where), true)));
}
