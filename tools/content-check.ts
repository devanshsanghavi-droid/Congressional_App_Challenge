/**
 * Ship gate for the bundled content packs.
 *
 * AUTHORSHIP: Claude. Prints everything a human still has to confirm before
 * submission and exits non-zero if anything is outstanding.
 *
 * Deliberately not wired into `npm test`. The outstanding items are known and
 * tracked; failing every test run on them would get the gate disabled within a
 * week. `tests/node/content.test.ts` pins the list instead, so a *new*
 * unverified entry fails the build while the known ones stay visible here.
 *
 *   npm run content:check
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  outstandingVerifications,
  parseCrossReferences,
  parseDocTypes,
  parseOffices,
} from '../src/lib/content/parse.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(REPO, 'content', name), 'utf8'));

const crossRefs = parseCrossReferences(read('cross_reference.json'));
const offices = parseOffices(read('offices.json'));
const docTypes = parseDocTypes(read('doc_types.json'));
const outstanding = outstandingVerifications(crossRefs, offices, docTypes);

if (outstanding.length === 0) {
  console.log('\ncontent: everything is verified at the agency source.\n');
  process.exit(0);
}

console.log(`\ncontent: ${outstanding.length} item(s) a human must confirm before this ships\n`);
for (const item of outstanding) {
  console.log(`  ${item.where}  [confidence: ${item.confidence}]`);
  console.log(`    ${item.reason}\n`);
}
console.log('CLAUDE.md §16: never ship a deadline rule, an appeal window, or an');
console.log('office detail that has not been checked at the source.\n');
process.exitCode = 1;
