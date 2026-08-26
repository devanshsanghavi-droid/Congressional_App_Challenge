/**
 * Bundled content packs, as the app sees them.
 *
 * AUTHORSHIP: Claude. App-side code.
 *
 * The only place the JSON is actually imported. Parsing and validation live in
 * `./parse`, which takes the raw data as an argument so the same code can be
 * driven from Metro here and from `fs` in the Node-side ship gate.
 */

import crossReferenceRaw from '../../../content/cross_reference.json';
import docTypesRaw from '../../../content/doc_types.json';
import officesRaw from '../../../content/offices.json';

import { parseCrossReferences, parseDocTypes, parseOffices } from './parse.ts';
import type { CrossReferencePack, DocTypesPack, OfficesPack } from './types.ts';

let crossReferences: CrossReferencePack | undefined;
let offices: OfficesPack | undefined;
let docTypes: DocTypesPack | undefined;

/** Parsed once and memoised — the packs are static and validation is not free. */
export function loadCrossReferences(): CrossReferencePack {
  crossReferences ??= parseCrossReferences(crossReferenceRaw);
  return crossReferences;
}

export function loadOffices(): OfficesPack {
  offices ??= parseOffices(officesRaw);
  return offices;
}

export function loadDocTypes(): DocTypesPack {
  docTypes ??= parseDocTypes(docTypesRaw);
  return docTypes;
}

export { CONFIRM_HOURS_NOTE, outstandingVerifications } from './parse.ts';
export type * from './types.ts';
